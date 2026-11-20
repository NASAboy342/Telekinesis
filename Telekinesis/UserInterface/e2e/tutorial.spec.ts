import { expect, test, type Page } from '@playwright/test'

const stepText = (page: Page) => page.getByTestId('tutorial-step')
const at = (page: Page, n: number) =>
  expect(stepText(page)).toContainText(`${n}/8`, { timeout: 8000 })

test('home links to the tutorial, which opens on step 1 with the guide card', async ({ page }) => {
  await page.goto('/#/')
  await page.getByTestId('open-tutorial').click()
  await expect(page.getByTestId('game-view')).toBeVisible()
  await expect(page.getByTestId('tutorial-card')).toBeVisible()
  await at(page, 1)
  await expect(page.getByTestId('tutorial-title')).toContainText('Show your hand')
  await expect(page.getByTestId('tutorial-hint')).toContainText(/camera/i)
  // no camera yet: the mouse way is spelled out too
  await expect(page.getByTestId('tutorial-mouse')).toBeVisible()
  await expect(page.getByTestId('tutorial-progress')).toHaveAttribute('aria-valuenow', '0')
  await expect(page.getByTestId('arena-hud')).toHaveCount(0)
})

test('/play and /arena have no tutorial card', async ({ page }) => {
  for (const path of ['/#/play', '/#/arena']) {
    await page.goto(path)
    await expect(page.getByTestId('game-view')).toBeVisible()
    await expect(page.getByTestId('tutorial-card')).toHaveCount(0)
  }
})

test('skip moves on one step at a time, through to the finish, and "Again" starts over', async ({
  page,
}) => {
  await page.goto('/#/tutorial')
  for (let n = 1; n < 8; n++) {
    await at(page, n)
    await page.getByTestId('tutorial-skip').click()
  }
  await at(page, 8)
  await expect(page.getByTestId('tutorial-title')).toContainText('Both hands open')
  await page.getByTestId('tutorial-skip').click()
  await expect(page.getByTestId('tutorial-done')).toBeVisible()
  await expect(page.getByTestId('tutorial-arena')).toBeVisible()
  await page.getByTestId('tutorial-restart').click()
  await at(page, 1)
  await expect(page.getByTestId('tutorial-done')).toHaveCount(0)
})

test('doing the gestures (mouse fallback) completes every step by itself', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/#/tutorial')
  await page.getByTestId('game-mouse').click()
  const box = (await page.getByTestId('game-canvas').boundingBox())!
  const cx = box.x + box.width * 0.6
  const cy = box.y + box.height * 0.5
  await page.mouse.move(cx, cy)
  // 1 · hold the button = a hand
  await at(page, 1)
  await page.mouse.down()
  await at(page, 2) // 2 · open palm
  await at(page, 3) // 3 · wave: keep the pointer moving
  for (let i = 0; i < 80; i++) {
    await page.mouse.move(cx + (i % 2 ? 90 : -90), cy, { steps: 3 })
    await page.waitForTimeout(25)
    if (await stepText(page).getByText('4/8').count()) break
  }
  await at(page, 4)
  // 4 · point: an arrow key
  await page.keyboard.down('ArrowUp')
  await at(page, 5)
  await page.keyboard.up('ArrowUp')
  // 5 · two fingers: Shift
  await page.keyboard.down('Shift')
  await at(page, 6)
  await page.keyboard.up('Shift')
  // 6 · pinch: Alt
  await page.keyboard.down('Alt')
  await at(page, 7)
  await page.keyboard.up('Alt')
  // 7 · fist: release the button
  await page.mouse.up()
  await at(page, 8)
  // 8 · stop: button + Space
  await page.mouse.down()
  await page.keyboard.down('Space')
  await expect(page.getByTestId('tutorial-done')).toBeVisible({ timeout: 8000 })
  await page.keyboard.up('Space')
  await page.mouse.up()
  await expect(page.getByTestId('tutorial-arena')).toBeVisible()
  await page.screenshot({ path: 'test-results/tutorial-done.png' })
})

test('tutorial card at desktop and phone width: nothing spills out', async ({ page }) => {
  for (const size of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size)
    await page.goto('/#/tutorial')
    await at(page, 1)
    const card = (await page.getByTestId('tutorial-card').boundingBox())!
    expect(card.x).toBeGreaterThanOrEqual(0)
    expect(card.x + card.width).toBeLessThanOrEqual(size.width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(size.width)
    await page.screenshot({ path: `test-results/tutorial-${size.width}.png` })
  }
})
