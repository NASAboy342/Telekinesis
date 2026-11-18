import { expect, test, type Page } from '@playwright/test'

/** How much ink (dark pixels) there is on the canvas — props, balloons, balls, floor… */
async function inkCount(page: Page): Promise<number> {
  return page.getByTestId('game-canvas').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if ((d[i + 3] ?? 0) > 40 && (d[i] ?? 255) < 100) n++
    return n
  })
}

const goal = (page: Page) => page.getByTestId('game-goal')
const score = (page: Page) => page.getByTestId('game-score')
const numberIn = async (el: ReturnType<Page['getByTestId']>) =>
  Number(((await el.textContent()) ?? '').replace(/\D/g, '') || 0)
/** the `have` of a "have/need" goal pill (numberIn would glue "0/8" into 8) */
const have = async (page: Page) =>
  Number(((await goal(page).textContent()) ?? '').trim().split('/')[0]!.replace(/\D/g, '') || 0)

const STAGES = [
  { n: 1, name: 'Pop Garden', need: 8 },
  { n: 2, name: 'Pyramid & Gongs', need: 3 },
  { n: 3, name: 'Domino Rally', need: 24 },
  { n: 4, name: 'Wrecking Ball', need: 12 },
  { n: 5, name: 'Moths & Whirlpool', need: 8 },
]

test('home links to the Arena, which opens on stage 1 with its HUD', async ({ page }) => {
  await page.goto('/#/')
  await page.getByTestId('open-arena').click()
  await expect(page.getByTestId('game-view')).toBeVisible()
  await expect(page.getByTestId('arena-hud')).toBeVisible()
  await expect(page.getByTestId('game-stage')).toContainText('1/5')
  await expect(page.getByTestId('game-stage')).toContainText('Pop Garden')
  await expect(goal(page)).toContainText('0/8')
  await expect(score(page)).toContainText('0')
  await expect(page.getByTestId('game-hint')).toContainText(/balloon/i)
  await expect(page.getByTestId('game-cleared')).toHaveCount(0)
  await expect(page.getByTestId('game-combo')).toHaveCount(0)
})

test('the free swarm (/play) has no Arena: no HUD, nothing but the balls and the floor', async ({
  page,
}) => {
  await page.goto('/#/play')
  await expect(page.getByTestId('game-view')).toBeVisible()
  await expect(page.getByTestId('arena-hud')).toHaveCount(0)
  await expect(page.getByTestId('game-restart')).toHaveCount(0)
})

for (const s of STAGES) {
  test(`stage ${s.n} (${s.name}) opens by URL: its goal, its props drawn, and no console errors`, async ({
    page,
  }) => {
    const problems: string[] = []
    page.on('console', (m) => m.type() === 'error' && problems.push(m.text()))
    page.on('pageerror', (e) => problems.push(e.message))
    await page.goto(`/#/arena?stage=${s.n}`)
    await expect(page.getByTestId('game-stage')).toContainText(`${s.n}/5`)
    await expect(page.getByTestId('game-stage')).toContainText(s.name)
    await expect(goal(page)).toContainText(`0/${s.need}`)
    await page.waitForTimeout(2200) // the stage settles: nothing should happen on its own
    await expect(goal(page)).toContainText(`0/${s.need}`)
    expect(await numberIn(score(page))).toBe(0)
    expect(await inkCount(page)).toBeGreaterThan(900) // the props are drawn (the swarm alone is ~400 px of ink)
    expect(problems).toEqual([])
  })
}

test('a comet straight up pops balloons: the goal and the score go up, with a combo', async ({
  page,
}) => {
  await page.goto('/#/arena')
  await page.getByTestId('game-mouse').click()
  const box = (await page.getByTestId('game-canvas').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5)
  await page.mouse.down() // open palm: float up
  await expect(page.getByTestId('game-mode')).toContainText('levitate')
  await page.keyboard.down('ArrowUp') // point up: the comet
  await expect.poll(() => have(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(1)
  await page.waitForTimeout(500)
  await page.keyboard.up('ArrowUp')
  expect(await have(page)).toBeGreaterThanOrEqual(1)
  expect(await numberIn(score(page))).toBeGreaterThanOrEqual(100)
  await page.mouse.up()
})

test('restart puts the stage back: goal, score and the balloons', async ({ page }) => {
  await page.goto('/#/arena')
  await page.getByTestId('game-mouse').click()
  const box = (await page.getByTestId('game-canvas').boundingBox())!
  const before = await inkCount(page)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.keyboard.down('ArrowUp')
  await expect.poll(() => have(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(1)
  await page.keyboard.up('ArrowUp')
  await page.mouse.up()
  await page.getByTestId('game-restart').click()
  await expect(goal(page)).toContainText('0/8')
  expect(await numberIn(score(page))).toBe(0)
  await expect(page.getByTestId('game-combo')).toHaveCount(0)
  await page.waitForTimeout(600)
  expect(Math.abs((await inkCount(page)) - before)).toBeLessThan(before * 0.2) // the same picture again
})

test('"next" is disabled until the stage is cleared', async ({ page }) => {
  await page.goto('/#/arena')
  const next = page.getByTestId('game-next')
  await expect(next).toBeVisible()
  await expect(next).toBeDisabled()
  await expect(next).toHaveAttribute('aria-label', 'Next stage')
  await next.click({ force: true }) // a disabled button does nothing
  await expect(page.getByTestId('game-stage')).toContainText('1/5')
})

test('the sound button toggles (aria-pressed) and swaps its icon', async ({ page }) => {
  await page.goto('/#/arena')
  const sound = page.getByTestId('game-sound')
  await expect(sound).toHaveAttribute('aria-pressed', 'true')
  // the icon is drawn from data, so a different icon means different shapes inside the svg
  const iconBefore = await sound.locator('svg[data-icon]').innerHTML()
  await sound.click()
  await expect(sound).toHaveAttribute('aria-pressed', 'false')
  expect(await sound.locator('svg[data-icon]').innerHTML()).not.toBe(iconBefore)
  await sound.click()
  await expect(sound).toHaveAttribute('aria-pressed', 'true')
})

test('the Arena works with avatar mode and the mouse fallback together', async ({ page }) => {
  await page.goto('/#/arena')
  await page.getByTestId('game-mouse').click()
  await page.getByTestId('game-avatar').click()
  await expect(page.getByTestId('game-avatar-pill')).toBeVisible()
  const box = (await page.getByTestId('game-canvas').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3, { steps: 6 })
  await page.waitForTimeout(500)
  await expect(page.getByTestId('game-stage')).toContainText('Pop Garden')
  expect(await inkCount(page)).toBeGreaterThan(900)
})
