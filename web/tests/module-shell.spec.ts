import { createRequire } from 'node:module'
import { test, expect } from '@playwright/test'

const require = createRequire(import.meta.url)
const { buildModuleShellOverlayScript } = require('../../desktop/electron/module-shell.cjs')
const script = buildModuleShellOverlayScript('cdna', 'cDNA Calculator', [
  { id: 'cdna', label: 'cDNA Calculator' }, { id: 'qpcr-planner', label: 'qPCR Planner' },
])

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    document.body.innerHTML = '<label>Sample <input aria-label="Sample" value="Sample 1"></label><button>Calculate</button>'
    Object.assign(window, { electronAPI: {
      returnToSuite: async () => { document.documentElement.dataset.destination = 'home' },
      openModuleInSuite: async (id: string) => { document.documentElement.dataset.destination = id },
    } })
  })
  // Electron appends its existing zoom overlay after this script.
  await page.evaluate(script + '\n(() => { document.documentElement.dataset.zoomReady = "true" })()')
  await expect(page.locator('html')).toHaveAttribute('data-zoom-ready', 'true')
})

test('switching tools requires confirmation after edits and cancelling preserves work', async ({ page }) => {
  const input = page.getByRole('textbox', { name: 'Sample' })
  await input.fill('My unsaved sample')
  const switcher = page.getByRole('combobox', { name: 'Switch tool' })
  await switcher.selectOption('qpcr-planner')
  const dialog = page.getByRole('dialog', { name: 'Leave this tool?' })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('button', { name: 'Keep working' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Leave tool', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(input).toHaveValue('My unsaved sample')
  await expect(switcher).toHaveValue('cdna')
  await expect(page.locator('html')).not.toHaveAttribute('data-destination')
  await page.getByRole('button', { name: 'All tools', exact: true }).click()
  await page.getByRole('button', { name: 'Leave tool', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-destination', 'home')
})

test('generated work is guarded and shell can be reattached without duplicate controls', async ({ page }) => {
  await page.evaluate(script)
  await expect(page.getByRole('combobox', { name: 'Switch tool' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Calculate', exact: true }).click()
  await page.getByRole('button', { name: 'All tools', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Keep working' }).click()
  await expect(page.getByRole('button', { name: 'All tools', exact: true })).toBeFocused()
})

test('clean navigation and failed launches retain usable controls', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Switch tool' }).selectOption('qpcr-planner')
  await expect(page.locator('html')).toHaveAttribute('data-destination', 'qpcr-planner')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.evaluate(() => Object.assign(window, { electronAPI: {
    returnToSuite: async () => { throw new Error('Could not open the library') },
  } }))
  await page.evaluate(script)
  await page.getByRole('button', { name: 'All tools', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Could not open the library')
  await expect(page.getByRole('button', { name: 'All tools', exact: true })).toBeEnabled()
  await expect(page.getByRole('combobox', { name: 'Switch tool' })).toBeEnabled()
})

test('plate colours follow module data despite older theme overrides', async ({ page }) => {
  const plateScript = buildModuleShellOverlayScript('elisa-analysis', 'ELISA Analysis', [{ id: 'elisa-analysis', label: 'ELISA Analysis' }])
  await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<style>.well-square { background: white !important } .page :is(.card,section.card) :is(span,.muted) { color: #102033 !important }</style><div class="page"><section class="card"><div class="well-square" style="background-color: rgb(122, 168, 154)"><span class="well-label">Std1</span></div></section></div>')
  })
  await page.evaluate(plateScript)
  await expect(page.locator('.well-square')).toHaveCSS('background-color', 'rgb(122, 168, 154)')
  await page.locator('.well-square').evaluate(el => { (el as HTMLElement).style.backgroundColor = 'rgb(154, 160, 170)' })
  await expect(page.locator('.well-square')).toHaveCSS('background-color', 'rgb(154, 160, 170)')
  await expect(page.locator('.well-label')).toHaveCSS('color', 'rgb(0, 0, 0)')
  await page.locator('.well-square').evaluate(el => { (el as HTMLElement).style.backgroundColor = 'rgb(31, 91, 255)' })
  await expect(page.locator('.well-label')).toHaveCSS('color', 'rgb(255, 255, 255)')
})
