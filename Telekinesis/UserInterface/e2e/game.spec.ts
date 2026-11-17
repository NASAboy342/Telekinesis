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

/** Bounding box (canvas px) of the ink inside a square window around (cx, cy); null when there is none. */
async function inkBox(page: Page, cx: number, cy: number, half: number) {
  return page.getByTestId('game-canvas').evaluate(
    (c: HTMLCanvasElement, a: { cx: number; cy: number; half: number }) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
      const sx = c.width / c.clientWidth
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (
        let y = Math.max(0, Math.floor((a.cy - a.half) * sx));
        y < Math.min(c.height, (a.cy + a.half) * sx);
        y++
      )
        for (
          let x = Math.max(0, Math.floor((a.cx - a.half) * sx));
          x < Math.min(c.width, (a.cx + a.half) * sx);
          x++
        ) {
          const i = (y * c.width + x) * 4
          if ((d[i + 3] ?? 0) > 40 && (d[i] ?? 255) < 100) {
            x0 = Math.min(x0, x)
            x1 = Math.max(x1, x)
            y0 = Math.min(y0, y)
            y1 = Math.max(y1, y)
          }
        }
      return x1 < 0
        ? null
        : { w: (x1 - x0) / sx, h: (y1 - y0) / sx, cx: (x0 + x1) / 2 / sx, cy: (y0 + y1) / 2 / sx }
    },
    { cx, cy, half },
  )
}

test('avatar mode: the hand is a small, steady character of constant size that sits at the pointer', async ({
  page,
}) => {
  await page.goto('/#/play')
  await page.getByTestId('game-mouse').click()
  await expect(page.getByTestId('game-avatar-pill')).toHaveCount(0)
  await page.getByTestId('game-avatar').click()
  await expect(page.getByTestId('game-avatar-pill')).toBeVisible()
  const box = (await page.getByTestId('game-canvas').boundingBox())!

  const at = async (fx: number, fy: number) => {
    const x = box.x + box.width * fx
    const y = box.y + box.height * fy
    await page.mouse.move(x, y, { steps: 8 })
    await page.waitForTimeout(900) // let the smoothing settle
    return { x: box.width * fx, y: box.height * fy }
  }
  const a = await at(0.3, 0.3)
  const boxA = (await inkBox(page, a.x, a.y, 70))!
  expect(boxA).not.toBeNull()
  expect(boxA.h).toBeGreaterThan(25) // a hand, not a dot…
  expect(boxA.h).toBeLessThan(60) // …but very small
  expect(boxA.w).toBeGreaterThan(15)
  expect(boxA.w).toBeLessThan(55)
  expect(Math.abs(boxA.cx - a.x)).toBeLessThan(15) // it is where the pointer is
  expect(Math.abs(boxA.cy - a.y)).toBeLessThan(20)

  const b = await at(0.7, 0.6) // somewhere else: same size, new place
  const boxB = (await inkBox(page, b.x, b.y, 70))!
  expect(Math.abs(boxB.h - boxA.h)).toBeLessThan(boxA.h * 0.1)
  expect(Math.abs(boxB.w - boxA.w)).toBeLessThan(boxA.w * 0.1)
  expect(Math.abs(boxB.cx - b.x)).toBeLessThan(15)

  // and nothing is left behind where it was
  expect(await inkBox(page, a.x, a.y, 70)).toBeNull()

  await page.getByTestId('game-avatar').click() // off again
  await expect(page.getByTestId('game-avatar-pill')).toHaveCount(0)
  // (the canvas repaints on the next animation frame, so poll — it must still disappear)
  await expect.poll(() => inkBox(page, b.x, b.y, 70), { timeout: 3000 }).toBeNull()
})

test('avatar mode: a back-facing fist (B) circles the balls around the avatar, and the circle follows it', async ({
  page,
}) => {
  await page.goto('/#/play')
  await page.getByTestId('game-mouse').click()
  await page.getByTestId('game-avatar').click()
  const box = (await page.getByTestId('game-canvas').boundingBox())!
  const px = (fx: number) => box.x + box.width * fx
  const py = (fy: number) => box.y + box.height * fy

  await page.mouse.move(px(0.25), py(0.3), { steps: 8 })
  await page.mouse.down() // open palm: the swarm floats up
  await expect(page.getByTestId('game-mode')).toContainText('levitate')
  await page.keyboard.down('b') // fist with the back to the camera → circle around the avatar
  await expect(page.getByTestId('game-mode')).toContainText('circle')
  await page.waitForTimeout(9000)
  let stage = await ink(page)
  expect(Math.abs(stage.x - 0.25)).toBeLessThan(0.07) // the balls (and the avatar) are all round the pointer
  expect(Math.abs(stage.y - 0.3)).toBeLessThan(0.1)

  // move the pointer: the circle's centre follows
  for (let i = 1; i <= 24; i++) {
    await page.mouse.move(px(0.25 + (0.5 * i) / 24), py(0.3 + (0.25 * i) / 24))
    await page.waitForTimeout(50)
  }
  await page.waitForTimeout(6000)
  stage = await ink(page)
  expect(Math.abs(stage.x - 0.75)).toBeLessThan(0.08)
  expect(Math.abs(stage.y - 0.55)).toBeLessThan(0.11)

  await page.keyboard.up('b') // back to an open palm: the circling stops, the balls just float on
  await expect(page.getByTestId('game-mode')).toContainText('levitate')
  await page.mouse.up()
})

test('no avatar mode: B does nothing special and nothing follows the pointer', async ({ page }) => {
  await page.goto('/#/play')
  await page.getByTestId('game-mouse').click()
  const box = (await page.getByTestId('game-canvas').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3, { steps: 8 })
  await page.mouse.down()
  await page.keyboard.down('b')
  await page.waitForTimeout(3000)
  await expect(page.getByTestId('game-mode')).toContainText('levitate') // still the plain open palm
  const stage = await ink(page)
  expect(stage.x).toBeGreaterThan(0.4) // the swarm stayed near the middle, it did not go to the pointer
  await page.keyboard.up('b')
  await page.mouse.up()
})
