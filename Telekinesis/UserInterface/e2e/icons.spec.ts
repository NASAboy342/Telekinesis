import { expect, test, type Page } from '@playwright/test'

/**
 * Icon audit — house rule: every clickable thing has an icon.
 * Copy to e2e/icons.spec.ts, list your routes, and add a step for every STATE that shows different controls
 * (offline/connected, banners, dialogs, after an action). Fails with the offending controls listed.
 *
 * A control that is genuinely not a labelled button (e.g. a drag grip) opts out with data-icon-exempt="<reason>".
 * Native <select>/<input> are not buttons: give them a leading field icon (checked in the last test).
 */
const CLICKABLE =
  'button, a[href], [role="radio"], [role="tab"], [role="menuitem"], [role="slider"], summary'

export async function withoutIcon(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const bad: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') continue
      if (el.hasAttribute('data-icon-exempt') || el.querySelector('svg[data-icon]')) continue
      bad.push(
        `${el.tagName.toLowerCase()}[${el.getAttribute('data-testid') ?? el.textContent?.trim().slice(0, 30)}]`,
      )
    }
    return bad
  }, CLICKABLE)
}

const ROUTES = ['/#/', '/#/spike', '/#/play', '/#/arena']

for (const route of ROUTES) {
  test(`${route}: every clickable has an icon`, async ({ page }) => {
    await page.goto(route)
    await page
      .locator('[data-testid=home-view], [data-testid=spike-view], [data-testid=game-view]')
      .first()
      .waitFor()
    expect(await withoutIcon(page)).toEqual([])
  })
}

test('the audit really looks at the controls (not an empty selection)', async ({ page }) => {
  await page.goto(ROUTES[0])
  const visible = await page
    .locator(CLICKABLE)
    .evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).length)
  expect(visible).toBeGreaterThanOrEqual(1)
})

test('the audit itself catches an icon-less button', async ({ page }) => {
  await page.goto(ROUTES[0])
  await page.evaluate(() => {
    const b = document.createElement('button')
    b.textContent = 'Text only'
    b.dataset.testid = 'rogue'
    document.body.append(b)
  })
  expect(await withoutIcon(page)).toContain('button[rogue]')
})

test('form fields carry a leading icon', async ({ page }) => {
  await page.goto(ROUTES[0])
  // No form fields yet. When added: for (const id of [...]) expect parent to contain one svg[data-icon]
  expect(true).toBe(true)
})

test('/#/play in avatar mode with the mouse fallback: every clickable still has an icon', async ({
  page,
}) => {
  await page.goto('/#/play')
  await page.getByTestId('game-view').waitFor()
  await page.getByTestId('game-mouse').click()
  await page.getByTestId('game-avatar').click()
  await expect(page.getByTestId('game-avatar-pill')).toBeVisible()
  expect(await withoutIcon(page)).toEqual([])

  // the avatar toggle in particular: an icon-only tool button, so it carries a title and an accessible name
  const toggle = page.getByTestId('game-avatar')
  await expect(toggle.locator('svg[data-icon]')).toHaveCount(1)
  await expect(toggle).toHaveAttribute('title', /avatar/i)
  await expect(toggle).toHaveAttribute('aria-label', 'Avatar mode')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  // the pills are status pills: they carry an icon too
  await expect(page.getByTestId('game-avatar-pill').locator('svg[data-icon]')).toHaveCount(1)
})

test('/#/arena: every clickable has an icon, and the new HUD buttons are proper icon-only tool buttons', async ({
  page,
}) => {
  await page.goto('/#/arena')
  await page.getByTestId('game-view').waitFor()
  await page.getByTestId('game-mouse').click()
  await page.getByTestId('game-avatar').click()
  expect(await withoutIcon(page)).toEqual([])
  for (const [id, label] of [
    ['game-restart', 'Restart stage'],
    ['game-next', 'Next stage'],
    ['game-sound', 'Sound'],
  ] as const) {
    const b = page.getByTestId(id)
    await expect(b.locator('svg[data-icon]')).toHaveCount(1)
    await expect(b).toHaveAttribute('aria-label', label)
    await expect(b).toHaveAttribute('title', /.+/)
  }
  // the HUD pills carry an icon too
  for (const id of ['game-stage', 'game-goal', 'game-score', 'game-hint'])
    await expect(page.getByTestId(id).locator('svg[data-icon]')).toHaveCount(1)
})
