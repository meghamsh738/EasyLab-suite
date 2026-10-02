import { test, expect } from '@playwright/test'

const modules = ['labnotebook', 'cdna', 'qpcr-planner', 'qpcr-analysis', 'elisa-analysis', 'animal-pairing', 'breeding', 'ymaze']

test('all tools render without overflow or runtime errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your lab workspace' })).toBeVisible()
  for (const id of modules) await expect(page.getByTestId(`module-card-${id}`)).toBeVisible()
  await expect(page.getByTestId('suite-signature')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await page.getByTestId('module-card-ymaze').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight)).toBe(true)
  expect(errors).toEqual([])
})

test('search and category filters combine, persist and reset from an empty result', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Planning 2', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Planning 2', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('searchbox').fill('qPCR')
  await expect(page.getByTestId('module-card-qpcr-planner')).toBeVisible()
  await expect(page.getByTestId('module-card-qpcr-analysis')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('searchbox')).toHaveValue('qPCR')
  await expect(page.getByTestId('module-card-qpcr-planner')).toBeVisible()
  await page.getByRole('searchbox').fill('missing tool')
  await expect(page.getByTestId('suite-empty')).toBeVisible()
  await page.getByRole('button', { name: 'Show all tools' }).click()
  await expect(page.locator('.module-row')).toHaveCount(8)
  await expect(page.getByRole('searchbox')).toBeFocused()
  await page.getByRole('searchbox').fill('Plan reactions')
  await expect(page.getByTestId('module-card-cdna')).toBeVisible()
  await expect(page.locator('.module-row')).toHaveCount(1)
})

test('desktop notice has a name, traps focus and returns focus on Escape', async ({ page }) => {
  await page.goto('/')
  const opener = page.getByTestId('module-launch-cdna')
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Open in the desktop app' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Got it' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  expect(await page.evaluate(() => document.querySelector('dialog')?.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
})

test('failed launch retries the same module and background startup rejection is handled', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    let attempts = 0
    Object.assign(window, { electronAPI: {
      getSuiteInfo: async () => ({ version: 'test', platform: 'test', name: 'Easylab Suite' }),
      prewarmModule: async () => { throw new Error('Offline') },
      openModuleInSuite: async (id: string) => { attempts++; document.documentElement.dataset.launch = `${id}:${attempts}`; if (attempts === 1) throw new Error('Backend unavailable') },
    } })
  })
  await page.goto('/')
  await page.getByTestId('module-launch-cdna').click()
  await expect(page.getByRole('alert')).toContainText('Backend unavailable')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-launch', 'cdna:2')
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('pending launch prevents a second tool from starting', async ({ page }) => {
  await page.addInitScript(() => Object.assign(window, { electronAPI: {
    openModuleInSuite: () => new Promise(() => {}),
  } }))
  await page.goto('/')
  await page.getByTestId('module-launch-cdna').click()
  await expect(page.getByRole('status').filter({ hasText: 'Opening cDNA Calculator' })).toBeVisible()
  for (const id of modules) await expect(page.getByTestId(`module-launch-${id}`)).toBeDisabled()
})

test('mobile library keeps navigation, launch actions and modal within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Behaviour', exact: true }).click()
  await expect(page.getByTestId('module-card-ymaze')).toBeVisible()
  await page.getByTestId('module-launch-ymaze').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.getByRole('dialog').evaluate(el => el.getBoundingClientRect().right <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Got it' }).click()
  await expect(page.getByTestId('module-launch-ymaze')).toBeFocused()
})
