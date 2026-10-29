import { uniqueSuffix } from './app'
import { expect, test } from './fixtures'

test('imports a Spliit JSON file into a new group', async ({ page }) => {
  const name = `Fork import ${uniqueSuffix()}`
  await page.goto('/groups')
  await page.getByRole('button', { name: 'Open create options' }).click()
  await page.getByRole('menuitem', { name: 'Import from file' }).click()
  const payload = {
    name,
    currency: '$',
    currencyCode: 'USD',
    participants: [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ],
    expenses: [
      {
        title: 'Imported lunch',
        amount: 1200,
        expenseDate: '2026-01-02',
        paidById: 'a',
        paidFor: [
          { participantId: 'a', shares: 100 },
          { participantId: 'b', shares: 100 },
        ],
        splitMode: 'EVENLY',
      },
    ],
  }
  await page.locator('#file-import-upload').setInputFiles({
    name: 'group.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  })
  await expect(page.getByText('Spliit JSON', { exact: true })).toBeVisible()
  const dialog = page.getByRole('dialog')
  const participants = dialog
    .getByText('Participants', { exact: true })
    .locator('..')
  await expect(participants).toContainText('Alice, Bob')
  await expect(participants).not.toContainText('$')
  await expect(
    dialog.getByText('Participants and balances', { exact: true }),
  ).toHaveCount(0)
  await dialog.locator('.overflow-y-scroll').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  await page.waitForURL(/\/groups\/[^/]+/, { timeout: 30_000 })
  await expect(
    page.getByTestId('expense-card').filter({ hasText: 'Imported lunch' }),
  ).toBeVisible()
})

test('keeps a cancelled partial import reachable', async ({ page }) => {
  const name = `Cancelled import ${uniqueSuffix()}`
  let releaseBatch!: () => void
  let batchStarted!: () => void
  const started = new Promise<void>((resolve) => {
    batchStarted = resolve
  })
  const release = new Promise<void>((resolve) => {
    releaseBatch = resolve
  })
  await page.route('**/api/trpc/groups.importProcessBatch*', async (route) => {
    batchStarted()
    await release
    await route.continue()
  })
  await page.goto('/groups')
  await page.getByRole('button', { name: 'Open create options' }).click()
  await page.getByRole('menuitem', { name: 'Import from file' }).click()
  const payload = {
    name,
    currency: '$',
    currencyCode: 'USD',
    participants: [{ id: 'a', name: 'Alice' }],
    expenses: Array.from({ length: 51 }, (_, i) => ({
      title: `Expense ${i}`,
      amount: 100,
      expenseDate: '2026-01-02',
      paidById: 'a',
      paidFor: [{ participantId: 'a', shares: 100 }],
      splitMode: 'EVENLY',
    })),
  }
  await page.locator('#file-import-upload').setInputFiles({
    name: 'group.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  })
  const dialog = page.getByRole('dialog')
  await expect(page.getByText('Spliit JSON', { exact: true })).toBeVisible()
  await dialog.locator('.overflow-y-scroll').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  await started
  await dialog.getByRole('button', { name: 'Cancel import' }).click()
  releaseBatch()
  await expect(
    dialog.getByText(
      'Import cancelled. The partially imported group remains in your groups.',
    ),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await page.reload()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
})
