import { expect, test } from '@playwright/test'

test('home shows the logo as ink, and the tab icon is served', async ({ page, request }) => {
  await page.goto('/#/')
  const logo = page.getByTestId('app-logo')
  await expect(logo).toBeVisible()
  await expect(logo.locator('circle')).toHaveCount(16)
  const box = await logo.boundingBox()
  expect(box!.width).toBeGreaterThan(80)
  const href = await page.locator('link[rel="icon"]').getAttribute('href')
  expect(href).toBe('/favicon.svg')
  const res = await request.get(href!)
  expect(res.ok()).toBe(true)
  expect(res.headers()['content-type']).toContain('svg')
  expect(await res.text()).toContain('<circle')
  await page.screenshot({ path: 'test-results/home-logo.png' })
})
