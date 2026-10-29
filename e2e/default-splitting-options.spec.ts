import { addExpense, createGroup, paidForRow, uniqueSuffix } from './app'
import { expect, test } from './fixtures'

test('shares a saved default split with another browser', async ({
  page,
  browser,
  baseURL,
}) => {
  const groupId = await createGroup(page, {
    name: `Default split ${uniqueSuffix()}`,
    participants: ['Alice', 'Bob'],
  })
  await addExpense(page, groupId, {
    title: 'First',
    amount: '12',
    paidBy: 'Alice',
    splitMode: 'BY_SHARES',
    shares: { Alice: '2', Bob: '1' },
    saveDefault: true,
  })
  const context = await browser.newContext({ locale: 'en-US' })
  const visitor = await context.newPage()
  await visitor.goto(`${baseURL}/groups/${groupId}/expenses/create`)
  await expect(
    visitor.getByRole('button', { name: 'Create', exact: true }),
  ).toBeVisible()
  await expect(paidForRow(visitor, 'Alice').getByRole('textbox')).toHaveValue(
    '2',
  )
  await expect(paidForRow(visitor, 'Bob').getByRole('textbox')).toHaveValue('1')
  await context.close()
})

test('retains a browser-local default until a server default is saved', async ({
  page,
}) => {
  const groupId = await createGroup(page, {
    name: `Legacy split ${uniqueSuffix()}`,
    participants: ['Alice', 'Bob'],
  })
  await page.goto(`/groups/${groupId}/expenses/create`)
  await expect(
    page.getByRole('button', { name: 'Create', exact: true }),
  ).toBeVisible()
  const alice = (
    await paidForRow(page, 'Alice').getAttribute('data-id')
  )?.split('/')[0]
  const bob = (await paidForRow(page, 'Bob').getAttribute('data-id'))?.split(
    '/',
  )[0]
  expect(alice).toBeTruthy()
  expect(bob).toBeTruthy()
  await page.evaluate(
    ({ groupId, alice, bob }) => {
      localStorage.setItem(
        `${groupId}-defaultSplittingOptions`,
        JSON.stringify({
          splitMode: 'BY_SHARES',
          paidFor: [
            { participant: alice, shares: 300 },
            { participant: bob, shares: 100 },
          ],
        }),
      )
    },
    { groupId, alice, bob },
  )
  await page.reload()
  await expect(paidForRow(page, 'Alice').getByRole('textbox')).toHaveValue('3')
  await expect(paidForRow(page, 'Bob').getByRole('textbox')).toHaveValue('1')

  await addExpense(page, groupId, {
    title: 'New shared default',
    amount: '12',
    paidBy: 'Alice',
    splitMode: 'BY_SHARES',
    shares: { Alice: '2', Bob: '1' },
    saveDefault: true,
  })
  await page.goto(`/groups/${groupId}/expenses/create`)
  await expect(paidForRow(page, 'Alice').getByRole('textbox')).toHaveValue('2')
})
