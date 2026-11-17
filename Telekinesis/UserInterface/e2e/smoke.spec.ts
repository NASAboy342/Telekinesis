import { expect, test } from '@playwright/test'

/**
 * Regression pass: every route of the router renders, with no console errors, no uncaught exceptions and no failed
 * `/api` responses (needs the backend running: the home page reads `/api/app/version`).
 */
const ROUTES: { path: string; testid: string }[] = [
  { path: '/#/', testid: 'home-view' },
  { path: '/#/play', testid: 'game-view' },
  { path: '/#/spike', testid: 'spike-view' },
]

for (const { path, testid } of ROUTES) {
  test(`${path} renders cleanly (no console errors, no failed /api calls)`, async ({ page }) => {
    const problems: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console.error: ${m.text()}`)
    })
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
    page.on('response', (r) => {
      if (r.url().includes('/api/') && r.status() >= 400) problems.push(`${r.status()} ${r.url()}`)
    })
    page.on('requestfailed', (r) =>
      problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`),
    )

    await page.goto(path)
    await expect(page.getByTestId(testid)).toBeVisible()
    await page.waitForTimeout(1200) // let the first frames / the version call happen
    expect(problems).toEqual([])
  })
}

test('home shows the backend version (the host API is really reachable)', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.getByTestId('version-pill')).toContainText(/v\d+\.\d+\.\d+/)
})

test('avatar mode can be switched on and off on every visit without leftovers', async ({
  page,
}) => {
  await page.goto('/#/play')
  await page.getByTestId('game-avatar').click()
  await expect(page.getByTestId('game-avatar-pill')).toBeVisible()
  await page.getByTestId('game-back').click()
  await expect(page.getByTestId('home-view')).toBeVisible()
  await page.getByTestId('open-play').click()
  await expect(page.getByTestId('game-view')).toBeVisible()
  await expect(page.getByTestId('game-avatar-pill')).toHaveCount(0) // a fresh game starts in normal mode
  await expect(page.getByTestId('game-avatar')).toHaveAttribute('aria-pressed', 'false')
})
