/** @jest-environment node */
import { prisma } from '@/lib/prisma'
import { GET } from './route'

jest.mock('content-disposition', () => ({ create: () => 'attachment' }))
jest.mock('@/lib/prisma', () => ({
  prisma: { group: { findUnique: jest.fn() } },
}))

const expense = {
  id: 'expense-1',
  expenseDate: new Date('2026-01-01T00:00:00Z'),
  title: 'Lunch',
  category: { name: 'Food' },
  amount: 100,
  originalAmount: null,
  originalCurrency: null,
  conversionRate: null,
  paidById: 'a',
  paidFor: [
    { participantId: 'a', shares: 1 },
    { participantId: 'b', shares: 1 },
  ],
  isReimbursement: false,
  splitMode: 'EVENLY',
}

async function exportGroup(overrides: Record<string, unknown> = {}) {
  jest.mocked(prisma.group.findUnique).mockResolvedValue({
    id: 'g',
    name: 'Überblick',
    currency: '€',
    currencyCode: 'EUR',
    participants: [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ],
    expenses: [expense],
    ...overrides,
  } as never)
  const response = await GET({} as Request, {
    params: Promise.resolve({ groupId: 'g' }),
  })
  const csv = await response.text()
  // json2csv quotes text, including headers, and escapes embedded quotes.
  const rows = csv.replace(/^\uFEFF/, '').split(/\r?\n/)
  const parse = (row: string) =>
    Array.from(row.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g), (m) =>
      (m[1] ?? m[2]).replace(/""/g, '"'),
    )
  const headers = parse(rows[0])
  return {
    response,
    rows: rows
      .slice(1)
      .map((r) => Object.fromEntries(parse(r).map((v, i) => [headers[i], v]))),
  }
}

test('exports deterministic, balanced saldos in expense date order', async () => {
  const { rows } = await exportGroup({
    expenses: [{ ...expense, amount: 101 }],
  })
  expect(
    jest.mocked(prisma.group.findUnique).mock.calls.at(-1)?.[0]?.select
      ?.expenses,
  ).toMatchObject({
    orderBy: [{ expenseDate: 'asc' }, { createdAt: 'asc' }],
  })
  expect(rows[0]).toMatchObject({
    'Paid By': 'Alice',
    Cost: '1.01',
    'Is Reimbursement': 'No',
  })
  expect(Number(rows[0].Alice)).toBeGreaterThan(0)
  expect(Number(rows[0].Bob)).toBeLessThan(0)
  expect(Number(rows[0].Alice) + Number(rows[0].Bob)).toBe(0)
  expect([0.5, 0.51]).toContain(Number(rows[0].Alice))
})

test.each([
  [
    'unequal split',
    {
      amount: 100,
      splitMode: 'BY_AMOUNT',
      paidFor: [
        { participantId: 'a', shares: 10 },
        { participantId: 'b', shares: 90 },
      ],
    },
    '1.00',
    '0.9',
    '-0.9',
  ],
  ['income', { amount: -100 }, '-1.00', '-0.5', '0.5'],
  [
    'reimbursement',
    {
      amount: 80,
      isReimbursement: true,
      paidById: 'b',
      paidFor: [{ participantId: 'a', shares: 1 }],
    },
    '0.00',
    '-0.8',
    '0.8',
  ],
])(
  '%s has correct per-person net effects',
  async (_name, patch, cost, alice, bob) => {
    const { rows } = await exportGroup({ expenses: [{ ...expense, ...patch }] })
    expect(rows[0]).toMatchObject({ Cost: cost, Alice: alice, Bob: bob })
  },
)

test('preserves original currency, conversion rate and reimbursement flag', async () => {
  const { rows } = await exportGroup({
    expenses: [
      {
        ...expense,
        originalAmount: 120,
        originalCurrency: 'JPY',
        conversionRate: { toString: () => '1.25' },
      },
    ],
  })
  expect(rows[0]).toMatchObject({
    'Original cost': '120',
    'Original currency': 'JPY',
    'Conversion rate': '1.25',
    'Is Reimbursement': 'No',
  })
})

test('escapes spreadsheet formulas and keeps participant names separate from fixed fields', async () => {
  const { rows } = await exportGroup({
    currencyCode: null,
    currency: '=CUSTOM',
    participants: [
      { id: 'a', name: 'amount' },
      { id: 'b', name: '=Bob' },
    ],
    expenses: [{ ...expense, title: '=1+1', category: { name: '@Food' } }],
  })
  expect(rows[0]).toMatchObject({
    Description: "'=1+1",
    Category: "'@Food",
    Currency: "'=CUSTOM",
    Cost: '1.00',
    'Paid By': 'amount',
    amount: '0.5',
    "'=Bob": '-0.5',
  })
})
