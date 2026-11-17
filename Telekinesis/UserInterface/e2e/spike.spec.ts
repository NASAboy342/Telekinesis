import { expect, test } from '@playwright/test'

test('spike: camera + hand model start and the tracking loop runs', async ({ page }) => {
  await page.goto('/#/spike')
  await page.getByTestId('spike-start').click()
  await expect(page.getByTestId('spike-hands')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('spike-status')).toContainText('running')
  await expect(page.getByTestId('spike-status')).toContainText(/[1-9]\d* fps/, { timeout: 10_000 })
  await expect(page.getByTestId('spike-error')).toHaveCount(0)
  await page.getByTestId('spike-stop').click()
  await expect(page.getByTestId('spike-start')).toBeVisible()
})
