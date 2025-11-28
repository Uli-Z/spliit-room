import fs from 'fs'
import path from 'path'

import { splitwiseCsvFormat } from '@/lib/imports/formats/splitwise-csv'

const readFixture = (filename: string) => {
  const filePath = path.join(
    process.cwd(),
    'src',
    'lib',
    'imports',
    'fixtures',
    filename,
  )
  return fs.readFileSync(filePath, 'utf8')
}

describe('SplitwiseCsvFormat', () => {
  const csv = readFixture('splitwise-test.csv')
  const result = splitwiseCsvFormat.parseToInternal(csv)

  it('parses the splitwise-test fixture and respects basic invariants', () => {
    expect(result.expenses.length).toBe(11)

    // No expense should have zero or negative amount.
    for (const expense of result.expenses) {
      expect(expense.amount).toBeGreaterThan(0)
    }

    // Rows with zero totals or invalid combinations should be reported as errors.
    const errors = result.errors ?? []
    expect(errors.length).toBeGreaterThan(0)
    expect(
      errors.some(
        (e) =>
          e.message.includes(
            'Missing or invalid date, amount or description',
          ),
      ),
    ).toBe(true)
    // We know our fixture has three invalid zero-total rows.
    expect(errors).toHaveLength(3)
    const errorRows = errors.map((e) => e.row)
    expect(errorRows).toEqual(expect.arrayContaining([6, 10, 11]))

    const row6 = errors.find((e) => e.row === 6)
    const row10 = errors.find((e) => e.row === 10)
    const row11 = errors.find((e) => e.row === 11)
    expect(row6?.message).toContain('No-op row')
    expect(row10?.message).toContain('Zero total with deltas (invalid)')
    expect(row11?.message).toContain('Payment no-op')
  })

  it('handles simple equal single payer correctly', () => {
    const expense = result.expenses.find((e) =>
      e.title.startsWith('Simple equal single payer'),
    )
    expect(expense).toBeDefined()
    expect(expense!.amount).toBe(3000)
    expect(expense!.paidBy).toBe('Alice')
    expect(expense!.paidFor).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant: 'Alice', shares: 1000 }),
        expect.objectContaining({ participant: 'Bob', shares: 1000 }),
        expect.objectContaining({ participant: 'Charlie', shares: 1000 }),
      ]),
    )
  })

  it('handles uneven single payer correctly', () => {
    const expense = result.expenses.find((e) =>
      e.title.startsWith('Uneven single payer'),
    )
    expect(expense).toBeDefined()
    expect(expense!.amount).toBe(4000)
    expect(expense!.paidBy).toBe('Alice')
    expect(expense!.paidFor).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant: 'Alice', shares: 2000 }),
        expect.objectContaining({ participant: 'Bob', shares: 1000 }),
        expect.objectContaining({ participant: 'Charlie', shares: 1000 }),
      ]),
    )
  })

  it('splits multi-payer equal split into two payer rows', () => {
    const expenses = result.expenses.filter(
      (e) => e.title === 'Multi-payer equal split',
    )
    expect(expenses).toHaveLength(2)

    const alice = expenses.find((e) => e.paidBy === 'Alice')
    const bob = expenses.find((e) => e.paidBy === 'Bob')

    expect(alice).toBeDefined()
    expect(bob).toBeDefined()

    expect(alice!.amount).toBe(1500)
    expect(alice!.paidFor).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant: 'Alice', shares: 1000 }),
        expect.objectContaining({ participant: 'Bob', shares: 500 }),
      ]),
    )

    expect(bob!.amount).toBe(1500)
    expect(bob!.paidFor).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant: 'Bob', shares: 500 }),
        expect.objectContaining({ participant: 'Charlie', shares: 1000 }),
      ]),
    )
  })

  it('treats self-payment equal shares as three independent self-paid expenses', () => {
    const expenses = result.expenses.filter((e) =>
      e.title.startsWith('Self-payment equal shares'),
    )
    expect(expenses).toHaveLength(3)

    for (const expense of expenses) {
      expect(expense.amount).toBe(3000)
      expect(expense.paidFor).toHaveLength(1)
      expect(expense.paidFor[0]).toEqual(
        expect.objectContaining({
          participant: expense.paidBy,
          shares: 3000,
        }),
      )
    }
  })

  it('converts Bob→Charlie payment into a reimbursement', () => {
    const expense = result.expenses.find(
      (e) => e.title === 'Bob pays Charlie',
    )
    expect(expense).toBeDefined()
    expect(expense!.isReimbursement).toBe(true)
    expect(expense!.amount).toBe(2500)
    expect(expense!.paidBy).toBe('Bob')
    expect(expense!.paidFor).toEqual([
      expect.objectContaining({ participant: 'Charlie', shares: 2500 }),
    ])
  })

  it('converts Alice→Bob+Charlie payment into two reimbursements', () => {
    const expenses = result.expenses.filter((e) =>
      e.title.startsWith('Alice pays '),
    )
    expect(expenses).toHaveLength(2)

    const toBob = expenses.find((e) =>
      e.paidFor.some((p) => p.participant === 'Bob'),
    )
    const toCharlie = expenses.find((e) =>
      e.paidFor.some((p) => p.participant === 'Charlie'),
    )

    expect(toBob).toBeDefined()
    expect(toCharlie).toBeDefined()

    expect(toBob!.isReimbursement).toBe(true)
    expect(toBob!.amount).toBe(1000)
    expect(toBob!.paidBy).toBe('Alice')
    expect(toBob!.paidFor).toEqual([
      expect.objectContaining({ participant: 'Bob', shares: 1000 }),
    ])

    expect(toCharlie!.isReimbursement).toBe(true)
    expect(toCharlie!.amount).toBe(500)
    expect(toCharlie!.paidBy).toBe('Alice')
    expect(toCharlie!.paidFor).toEqual([
      expect.objectContaining({ participant: 'Charlie', shares: 500 }),
    ])
  })

  it('handles zero-delta participant by excluding them from shares', () => {
    const expense = result.expenses.find((e) =>
      e.title.startsWith('Zero-delta participant'),
    )
    expect(expense).toBeDefined()
    expect(expense!.amount).toBe(5000)
    expect(expense!.paidBy).toBe('Alice')
    expect(expense!.paidFor).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant: 'Alice', shares: 4000 }),
        expect.objectContaining({ participant: 'Bob', shares: 1000 }),
      ]),
    )
    // Charlie should not appear in the shares.
    expect(
      expense!.paidFor.some((p) => p.participant === 'Charlie'),
    ).toBe(false)
  })

  it('does not create expenses for rows with zero totals', () => {
    const titles = result.expenses.map((e) => e.title)

    // These rows in the CSV have zero totals and should not become expenses.
    expect(
      titles.some((t) => t.startsWith('No-op row')),
    ).toBe(false)
    expect(
      titles.some((t) => t.startsWith('Zero total with deltas (invalid)')),
    ).toBe(false)
    expect(
      titles.some((t) => t.startsWith('Payment no-op')),
    ).toBe(false)
  })
})
