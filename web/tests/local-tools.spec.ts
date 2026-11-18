import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

const gelImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAQQAAACMCAIAAAAV/kBcAAABu0lEQVR4nO3cMU7EMBRAQS/iMFtstddBSBwNCeWeFDxaKnuJYaZKFaV5+rGV+HK93QcwxtNvPwCchRggYoCIASIGiBggYoCIASIGiBggYoCIASIGiBggYoCIASIGiBggYoCIASIGiBggYoCIASIGiBggYoCIASIGiBggYoCIASIGiBggYoCIASIGyPNY4Ph4n3Wrl9e3WbeCn5kMEDFAxAARA+Ryvd2/r+FfMxkgYoCIASIGiBggYoCIASIGiBggYoCIASIGWPmn2478nYfJABEDRAwQMUD86bYxi/65TAaIGCBigIgBVi6gLezYkckAEQNEDBBfrfJQx4nXk0tisOplR16TIGKAiAHiq1WIyQARA0QMEDFAxAARA0QMEDFAxAARA0QMEDFAxAARA0QMEDHAygMBznwCwl96ZuZyVMzGBDyX1ySIGCBigDhRb+NnZi5HxUDsJvFQx4l3wKwZIGKAiAEiBojdJIjJABEDRAwQMUDEABEDRAwQMUDEABEDRAwQMUDEABEDRAwQMUDEABEDRAwQMUDEABEDRAwQMUDEABEDRAwQMUDEABEDRAwQMUDEABEDRAwwvnwCsZwjFJjEzrIAAAAASUVORK5CYII=', 'base64')

test('Gel Labeler annotates an imported copy and reopens its editable project', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open Gel Labeler', exact: true }).click()
  await page.getByLabel('Choose gel or blot image').setInputFiles({
    name: 'fictional-gel.png', mimeType: 'image/png', buffer: gelImage,
  })
  await page.getByRole('button', { name: 'Place lane label', exact: true }).click()
  await page.getByTestId('gel-stage').click({ position: { x: 40, y: 30 } })
  await page.getByLabel('Label name', { exact: true }).fill('Sample A')
  const pngDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download labeled PNG', exact: true }).click()
  const png = await readFile((await (await pngDownload).path())!)
  expect(png.subarray(0, 8)).toEqual(gelImage.subarray(0, 8))
  expect(png).not.toEqual(gelImage)
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: 'Back to tools', exact: true }).click()
  await expect(page.getByLabel('Label name', { exact: true })).toHaveValue('Sample A')
  const projectDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project', exact: true }).click()
  const project = await readFile((await (await projectDownload).path())!)
  const savedImage = JSON.parse(project.toString()).source.dataUrl.split(',')[1]
  expect(Buffer.from(savedImage, 'base64')).toEqual(gelImage)
  await page.getByRole('button', { name: /back to tools/i }).click()
  await page.getByRole('button', { name: 'Open Gel Labeler', exact: true }).click()
  await page.getByLabel('Open Gel Labeler project').setInputFiles({
    name: 'fictional-gel.easylab.json', mimeType: 'application/json', buffer: project,
  })
  await expect(page.getByTestId('gel-annotation').filter({ hasText: 'Sample A' })).toBeVisible()
})

test('Lab Inventory keeps stock changes and restores a portable backup', async ({ page, browser }) => {
  async function openInventory(target: typeof page) {
    await target.goto('/')
    await target.getByRole('button', { name: 'Open Lab Inventory', exact: true }).click()
  }

  await openInventory(page)
  await page.getByRole('button', { name: 'Add item', exact: true }).click()
  const dialog = page.getByTestId('inventory-dialog')
  for (const [label, value] of [
    ['Item name', 'Fictional buffer'],
    ['Category', 'Reagent'],
    ['Storage location', 'Fridge B'],
    ['Unit', 'mL'],
    ['Amount in stock', '5'],
    ['Reorder point', '2'],
  ]) {
    await dialog.getByLabel(label).fill(value)
  }
  await dialog.getByTestId('inventory-save').click()
  await page.getByRole('button', { name: 'Use', exact: true }).click()
  await dialog.getByTestId('inventory-adjust-amount').fill('6')
  await dialog.getByTestId('inventory-adjust-save').click()
  await expect(dialog.getByRole('alert')).toContainText('Only 5 mL')
  await dialog.getByTestId('inventory-adjust-amount').fill('3')
  await dialog.getByTestId('inventory-adjust-save').click()
  const lowStockItem = page.getByRole('article', { name: 'Fictional buffer, 2 mL' })
  await expect(lowStockItem.getByText('Low stock', { exact: true })).toBeVisible()
  await lowStockItem.getByRole('button', { name: 'Receive', exact: true }).click()
  await dialog.getByTestId('inventory-adjust-amount').fill('2')
  await dialog.getByTestId('inventory-adjust-save').click()
  await openInventory(page)
  await expect(page.getByRole('article', { name: 'Fictional buffer, 4 mL' })).toBeVisible()

  const stale = await page.context().newPage()
  try {
    await openInventory(stale)
    await stale.getByRole('button', { name: 'Edit Fictional buffer', exact: true }).click()
    await stale.getByLabel('Notes', { exact: true }).fill('Draft from the other window')
    await page.getByRole('button', { name: 'Use', exact: true }).click()
    await dialog.getByTestId('inventory-adjust-amount').fill('0.1')
    await dialog.getByTestId('inventory-adjust-save').click()
    await expect(stale.getByTestId('inventory-save')).toBeDisabled()
    await expect(stale.getByTestId('inventory-dialog').getByRole('alert')).toContainText('another Suite window')
    await stale.getByTestId('inventory-dialog').getByRole('button', { name: 'Reload latest inventory', exact: true }).click()
    await expect(stale.getByRole('article', { name: 'Fictional buffer, 3.9 mL' })).toBeVisible()
  } finally {
    await stale.close()
  }
  const csvDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
  const csv = await readFile((await (await csvDownload).path())!, 'utf8')
  expect(csv).toContain('Fictional buffer')
  expect(csv).toContain('Fridge B')
  const backupDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download JSON backup', exact: true }).click()
  const backup = await readFile((await (await backupDownload).path())!)
  const saved = JSON.parse(backup.toString())
  expect(saved.items).toHaveLength(1)
  expect(saved.items[0].amount).toBe(3.9)
  expect(saved.history.map((event: { action: string }) => event.action)).toEqual(
    expect.arrayContaining(['created', 'received', 'used']),
  )

  const restored = await browser.newPage()
  try {
    await openInventory(restored)
    await restored.getByLabel('Choose a Lab Inventory backup').setInputFiles({
      name: 'inventory-backup.json', mimeType: 'application/json', buffer: backup,
    })
    await restored.getByRole('button', { name: 'Add new items', exact: true }).click()
    await expect(restored.getByRole('article', { name: 'Fictional buffer, 3.9 mL' })).toBeVisible()
  } finally {
    await restored.close()
  }
})
