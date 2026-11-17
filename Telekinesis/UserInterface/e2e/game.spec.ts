import { expect, test, type Page } from '@playwright/test'

/** Count dark pixels in the canvas (outline strokes on a white background). */
async function darkPixels(page: Page): Promise<number> {
  return page.getByTestId('game-canvas').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if ((d[i + 3] ?? 0) > 40 && (d[i] ?? 255) < 100) n++
    return n
  })
}

/**
 * Centre of mass of the drawn strokes (0..1), ignoring the floor line — found as any pixel row that is mostly ink.
 * (Works at any zoom: the balls are only a few pixels across.)
 */
async function ink(page: Page): Promise<{ x: number; y: number; n: number }> {
  return page.getByTestId('game-canvas').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    const dark = (i: number) => (d[i + 3] ?? 0) > 40 && (d[i] ?? 255) < 100
    let sx = 0
    let sy = 0
    let n = 0
    for (let y = 0; y < c.height; y++) {
      let row = 0
      for (let x = 0; x < c.width; x++) if (dark((y * c.width + x) * 4)) row++
      if (row > c.width * 0.5) continue // the floor line
      for (let x = 0; x < c.width; x++)
        if (dark((y * c.width + x) * 4)) {
          sx += x
          sy += y
          n++
        }
    }
    return n ? { x: sx / n / c.width, y: sy / n / c.height, n } : { x: 0, y: 0, n: 0 }
  })
}
const strokeCentreY = async (page: Page) => (await ink(page)).y
const strokeCentreX = async (page: Page) => (await ink(page)).x

test('game: white stage, outlined balls resting on the floor', async ({ page }) => {
  await page.goto('/#/play')
  await expect(page.getByTestId('game-mode')).toContainText('rest')
  await page.waitForTimeout(1500)
  expect(await darkPixels(page)).toBeGreaterThan(500)
  const stage = await ink(page)
  expect(stage.n).toBeGreaterThan(60) // the balls are drawn…
  expect(stage.y).toBeGreaterThan(0.8) // …piled near the bottom
})

test('game: mouse fallback — hold levitates, shift circles, release drops', async ({ page }) => {
  await page.goto('/#/play')
  await page.getByTestId('game-mouse').click()
  await page.waitForTimeout(1200)
  const resting = await strokeCentreY(page)

  const box = (await page.getByTestId('game-canvas').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.35)
  await page.mouse.down()
  await expect(page.getByTestId('game-mode')).toContainText('levitate')
  await page.waitForTimeout(3500)
  const floating = await strokeCentreY(page)
  expect(floating).toBeLessThan(resting - 0.02)

  // Shift while holding = two fingers → circle (the swarm stays gathered at the same hover point)
  await page.keyboard.down('Shift')
  await expect(page.getByTestId('game-mode')).toContainText('circle')
  await page.waitForTimeout(1500)
  expect(await strokeCentreY(page)).toBeLessThan(resting - 0.02)
  await page.keyboard.up('Shift')
  await expect(page.getByTestId('game-mode')).toContainText('levitate')

  // Arrow key while holding = point that way → the whole swarm travels
  const xBefore = await strokeCentreX(page)
  await page.keyboard.down('ArrowRight')
  await expect(page.getByTestId('game-mode')).toContainText('move')
  await page.waitForTimeout(2200)
  await page.keyboard.up('ArrowRight')
  expect(await strokeCentreX(page)).toBeGreaterThan(xBefore + 0.08)

  await page.mouse.up()
  await expect(page.getByTestId('game-mode')).toContainText('rest')
  await page.waitForTimeout(2500)
  expect(await strokeCentreY(page)).toBeGreaterThan(resting - 0.05)
})

test('game: camera starts from the game screen (fake webcam)', async ({ page }) => {
  await page.goto('/#/play')
  await page.getByTestId('game-camera-start').click()
  await expect(page.getByTestId('game-camera-stop')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('game-error')).toHaveCount(0)
})

test('game: open palm + a moving hand (mouse stands in) drifts the balls the way it moves', async ({
  page,
}) => {
  await page.goto('/#/play')
  await page.getByTestId('game-mouse').click()
  const box = (await page.getByTestId('game-canvas').boundingBox())!
  const cy = box.y + box.height * 0.35
  await page.mouse.move(box.x + 60, cy)
  await page.mouse.down()
  await expect(page.getByTestId('game-mode')).toContainText('levitate')
  await page.waitForTimeout(2500) // float up, settle
  const before = await strokeCentreX(page)
  // wave the hand steadily to the right (~1 frame-height per second) a few times
  for (let sweep = 0; sweep < 3; sweep++) {
    await page.mouse.move(box.x + 60, cy)
    await page.waitForTimeout(700) // pointer at rest: no drift
    for (let i = 0; i < 50; i++) {
      await page.mouse.move(box.x + 60 + i * 18, cy)
      await page.waitForTimeout(16)
    }
  }
  await page.waitForTimeout(300)
  const after = await strokeCentreX(page)
  expect(after - before).toBeGreaterThan(0.01) // the balls moved to the right
  await page.mouse.up()
})

test('game: the closer the (mouse-wheel) hand, the more a wave drifts the balls', async ({
  page,
}) => {
  async function waveShift(wheelNotches: number): Promise<number> {
    await page.goto('/#/play')
    await page.reload() // a fresh stage each time (the same hash URL would keep the old one)
    await page.getByTestId('game-mouse').click()
    const box = (await page.getByTestId('game-canvas').boundingBox())!
    const cy = box.y + box.height * 0.35
    await page.mouse.move(box.x + 60, cy)
    // wheel up = closer, wheel down = further (each notch is 0.1 of the reach)
    for (let i = 0; i < Math.abs(wheelNotches); i++)
      await page.mouse.wheel(0, wheelNotches > 0 ? -100 : 100)
    await page.mouse.down()
    await expect(page.getByTestId('game-mode')).toContainText('levitate')
    await page.waitForTimeout(2500)
    const before = await strokeCentreX(page)
    for (let sweep = 0; sweep < 3; sweep++) {
      await page.mouse.move(box.x + 60, cy)
      await page.waitForTimeout(700)
      for (let i = 0; i < 50; i++) {
        await page.mouse.move(box.x + 60 + i * 18, cy)
        await page.waitForTimeout(16)
      }
    }
    await page.waitForTimeout(300)
    const shift = (await strokeCentreX(page)) - before
    await page.mouse.up()
    return shift
  }
  const far = await waveShift(-5) // reach 0
  const near = await waveShift(5) // reach 1
  expect(near).toBeGreaterThan(far + 0.015)
})

test('game: stop (Space = both hands open) brakes a moving swarm to a standstill', async ({
  page,
}) => {
  await page.goto('/#/play')
  await page.getByTestId('game-mouse').click()
  const box = (await page.getByTestId('game-canvas').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.35)
  await page.mouse.down()
  await expect(page.getByTestId('game-mode')).toContainText('levitate')
  await page.waitForTimeout(1500)
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(2200) // build up speed
  await page.keyboard.up('ArrowRight')
  await expect(page.getByTestId('game-stop')).toHaveCount(0)

  // without stopping, it coasts on (light air drag)…
  const a = await strokeCentreX(page)
  await page.waitForTimeout(400)
  const coasting = (await strokeCentreX(page)) - a
  expect(coasting).toBeGreaterThan(0.01)

  // …with Space (both hands open) it brakes to a standstill and stays there
  await page.keyboard.down(' ')
  await expect(page.getByTestId('game-stop')).toBeVisible()
  await page.waitForTimeout(900)
  const b = await strokeCentreX(page)
  await page.waitForTimeout(700)
  expect(Math.abs((await strokeCentreX(page)) - b)).toBeLessThan(0.004)
  await page.keyboard.up(' ')
  await expect(page.getByTestId('game-stop')).toHaveCount(0)
  await page.mouse.up()
})
