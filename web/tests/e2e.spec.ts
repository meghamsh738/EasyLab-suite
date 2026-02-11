import { test, expect } from '@playwright/test'

test('suite home loads with modules', async ({ page }) => {
  await page.goto('/')
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' })

  await expect(page.getByRole('heading', { name: 'Easylab Suite' })).toBeVisible()
  await expect(page.getByTestId('module-card-labnotebook')).toBeVisible()
  await expect(page.getByTestId('module-card-cdna')).toBeVisible()
  await expect(page.getByTestId('module-card-qpcr-planner')).toBeVisible()
  await expect(page.getByTestId('module-card-qpcr-analysis')).toBeVisible()
  await expect(page.getByTestId('module-card-elisa-analysis')).toBeVisible()
  await expect(page.getByTestId('module-card-animal-pairing')).toBeVisible()
  await expect(page.getByTestId('module-card-breeding')).toBeVisible()
  await expect(page.getByTestId('module-card-ymaze')).toBeVisible()
  await expect(page.getByTestId('suite-signature')).toBeVisible()

  await expect(page).toHaveScreenshot('suite_home.png', { fullPage: true })
})

test('launching a module in web mode shows the desktop modal', async ({ page }) => {
  await page.goto('/')
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' })

  await page.getByTestId('module-launch-cdna').click()
  const modal = page.getByTestId('web-modal')
  await expect(modal).toBeVisible()
  await expect(modal).toHaveScreenshot('desktop_modal.png')
})
