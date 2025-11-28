import { splitCsvLine } from '@/lib/csv-utils'
import { mapSplitwiseCategoryLabel } from '@/lib/splitwise-category-mapping'
import {
  detectSplitwiseHeaders,
  type SplitwiseExportLanguage,
} from '@/lib/splitwise-export-headers'
import { parseSplitwiseExportCsv } from '@/lib/splitwise-export-parse'
import { importFormats, type ImportFormat } from '@/lib/imports/types'
import { ExpenseFormValues } from '@/lib/schemas'

const normalizeName = (value: string, fallback: string) => {
  const trimmed = value.trim()
  return trimmed || fallback
}

// ---- helpers ported from reference Python algorithm ------------------------

type Shares = Record<string, number>
type Deltas = Record<string, number>

// Split an integer total equally among participants (cents).
const equalSplit = (totalC: number, participants: string[]): Shares => {
  const n = participants.length
  if (n === 0) return {}
  const base = Math.trunc(totalC / n)
  let rem = totalC % n
  const shares: Shares = {}
  for (const p of participants) {
    shares[p] = base
  }
  for (const p of [...participants].sort()) {
    if (rem <= 0) break
    shares[p] += 1
    rem -= 1
  }
  const sum = Object.values(shares).reduce((s, v) => s + v, 0)
  if (sum !== totalC) {
    throw new Error('equalSplit: sum of shares does not match total')
  }
  return shares
}

type ReimbursementModel = {
  description: string
  payer: string
  receiver: string
  amountC: number
}

// Interpret deltas purely as reimbursements (no group expense).
const decomposeDeltasToReimbursements = (
  description: string,
  participants: string[],
  deltasC: Deltas,
): ReimbursementModel[] => {
  const positives: Array<[string, number]> = []
  const negatives: Array<[string, number]> = []
  for (const p of participants) {
    const d = deltasC[p] ?? 0
    // In Splitwise exports, for payment rows a *positive* delta means
    // the participant's balance increases (they are the payer whose debt
    // is reduced). A *negative* delta means their credit decreases
    // (they are the receiver). We therefore treat positives as payers
    // and negatives as receivers when decomposing into reimbursements.
    if (d > 0) positives.push([p, d])
    else if (d < 0) negatives.push([p, -d])
  }

  if (positives.length === 0 && negatives.length === 0) return []

  const sumPositives = positives.reduce((s, [, v]) => s + v, 0)
  const sumNegatives = negatives.reduce((s, [, v]) => s + v, 0)
  if (sumPositives !== sumNegatives) {
    throw new Error(
      'deltas do not sum to zero; cannot decompose into reimbursements',
    )
  }

  const reimbursements: ReimbursementModel[] = []
  let i = 0
  let j = 0

  while (i < positives.length && j < negatives.length) {
    let [payer, budget] = positives[i]!
    let [recv, need] = negatives[j]!
    const amt = Math.min(budget, need)
    if (amt > 0) {
      reimbursements.push({
        description,
        payer,
        receiver: recv,
        amountC: amt,
      })
      budget -= amt
      need -= amt
    }

    if (budget === 0) i += 1
    else positives[i] = [payer, budget]

    if (need === 0) j += 1
    else negatives[j] = [recv, need]
  }

  return reimbursements
}

type SharesPaidModel = {
  sharesC: Shares
  paidC: Shares
}

// Core: build shares + paid model for a group expense (total > 0).
const buildShareAndPaidModelForGroup = (
  totalC: number,
  participants: string[],
  deltasC: Deltas,
): SharesPaidModel => {
  if (totalC <= 0) {
    throw new Error('buildShareAndPaidModelForGroup requires totalC > 0')
  }

  const P = participants
  const D = deltasC

  const positives = P.filter((p) => (D[p] ?? 0) > 0)

  // 1) Single-payer case
  if (positives.length === 1) {
    const payer = positives[0]!
    const deltaPayer = D[payer] ?? 0
    if (deltaPayer <= totalC) {
      const sharesC: Shares = {}
      for (const p of P) {
        const d = D[p] ?? 0
        if (p === payer) {
          sharesC[p] = totalC - deltaPayer
        } else {
          sharesC[p] = d < 0 ? -d : 0
        }
      }
      const allNonNegative = Object.values(sharesC).every((v) => v >= 0)
      const sumShares = Object.values(sharesC).reduce((s, v) => s + v, 0)
      if (allNonNegative && sumShares === totalC) {
        const paidC: Shares = {}
        for (const p of P) {
          paidC[p] = p === payer ? totalC : 0
        }
        return { sharesC, paidC }
      }
    }
    // fall through on sanity failure
  }

  // 2) All deltas == 0: equal share and equal paid
  if (P.every((p) => (D[p] ?? 0) === 0)) {
    const sharesC = equalSplit(totalC, P)
    const paidC = { ...sharesC }
    return { sharesC, paidC }
  }

  const nonzero = P.filter((p) => (D[p] ?? 0) !== 0)

  const tryEqualOnSubset = (
    subset: string[],
  ): { ok: boolean; sharesC: Shares; paidC: Shares } => {
    const s = equalSplit(totalC, subset)
    const paid: Shares = {}
    for (const p of subset) {
      paid[p] = s[p]! + (D[p] ?? 0)
    }
    if (Object.values(paid).some((v) => v < 0)) {
      return { ok: false, sharesC: s, paidC: paid }
    }
    const sumPaid = Object.values(paid).reduce((sum, v) => sum + v, 0)
    if (sumPaid !== totalC) {
      return { ok: false, sharesC: s, paidC: paid }
    }
    return { ok: true, sharesC: s, paidC: paid }
  }

  const minShareOnSubset = (subset: string[]): SharesPaidModel => {
    const minShare: Shares = {}
    for (const p of subset) {
      const d = D[p] ?? 0
      minShare[p] = Math.max(0, -d)
    }
    const minSum = Object.values(minShare).reduce((s, v) => s + v, 0)
    if (minSum > totalC) {
      throw new Error('min-share model infeasible on subset')
    }

    let remaining = totalC - minSum
    const base = Math.trunc(remaining / subset.length)
    let rem = remaining % subset.length
    const shares: Shares = {}
    for (const p of subset) {
      shares[p] = minShare[p]! + base
    }
    for (const p of [...subset].sort((a, b) =>
      shares[a]! === shares[b]!
        ? a.localeCompare(b)
        : shares[a]! - shares[b]!,
    )) {
      if (rem <= 0) break
      shares[p] += 1
      rem -= 1
    }

    const sumShares = Object.values(shares).reduce((s, v) => s + v, 0)
    if (sumShares !== totalC) {
      throw new Error('min-share produced wrong share sum')
    }

    const paid: Shares = {}
    for (const p of subset) {
      paid[p] = shares[p]! + (D[p] ?? 0)
    }
    if (Object.values(paid).some((v) => v < 0)) {
      throw new Error('min-share produced negative paid')
    }
    const sumPaid = Object.values(paid).reduce((s, v) => s + v, 0)
    if (sumPaid !== totalC) {
      throw new Error('min-share produced wrong paid sum')
    }

    return { sharesC: shares, paidC: paid }
  }

  // 3) Equal shares among nonzero-delta participants
  if (nonzero.length > 0) {
    const { ok, sharesC, paidC } = tryEqualOnSubset(nonzero)
    if (ok) {
      const sAll: Shares = {}
      const pAll: Shares = {}
      for (const p of P) {
        sAll[p] = sharesC[p] ?? 0
        pAll[p] = paidC[p] ?? 0
      }
      return { sharesC: sAll, paidC: pAll }
    }
  }

  // 4) Min-share model on nonzero participants
  if (nonzero.length > 0) {
    try {
      const { sharesC, paidC } = minShareOnSubset(nonzero)
      const sAll: Shares = {}
      const pAll: Shares = {}
      for (const p of P) {
        sAll[p] = sharesC[p] ?? 0
        pAll[p] = paidC[p] ?? 0
      }
      return { sharesC: sAll, paidC: pAll }
    } catch {
      // fall through
    }
  }

  // 5) Final fallback: min-share on all participants
  return minShareOnSubset(P)
}

type GroupExpenseModel = {
  description: string
  payer: string
  participants: string[]
  totalC: number
  sharesC: Shares
}

// Split shares+paid into single-payer expenses.
const allocateSharesToPayers = (
  description: string,
  participants: string[],
  sharesC: Shares,
  paidC: Shares,
): GroupExpenseModel[] => {
  const groupExpenses: GroupExpenseModel[] = []
  const remaining: Shares = { ...sharesC }
  const payers = participants.filter((p) => (paidC[p] ?? 0) > 0)

  for (const payer of [...payers].sort()) {
    let need = paidC[payer] ?? 0
    const rowAlloc: Shares = {}
    for (const person of [...participants].sort()) {
      if (need === 0) break
      const available = remaining[person] ?? 0
      const take = Math.min(need, available)
      if (take > 0) {
        rowAlloc[person] = (rowAlloc[person] ?? 0) + take
        remaining[person] = available - take
        need -= take
      }
    }
    if (need !== 0) {
      throw new Error('allocation failed; payer row not fully satisfied')
    }
    const filteredRowAlloc: Shares = {}
    for (const [p, v] of Object.entries(rowAlloc)) {
      if (v > 0) filteredRowAlloc[p] = v
    }
    groupExpenses.push({
      description,
      payer,
      participants,
      totalC: paidC[payer] ?? 0,
      sharesC: filteredRowAlloc,
    })
  }

  const leftover = Object.values(remaining).reduce((s, v) => s + v, 0)
  if (leftover !== 0) {
    throw new Error('not all shares allocated')
  }

  return groupExpenses
}

type ParsedRowModel = {
  groupExpenses: GroupExpenseModel[]
  reimbursements: ReimbursementModel[]
}

// Allow tiny rounding drift in participant deltas (in cents).
const MAX_DELTA_DRIFT_CENTS = 1

const parseExportRow = (
  description: string,
  isPaymentCategory: boolean,
  totalC: number,
  participants: string[],
  deltasC: Deltas,
): ParsedRowModel => {
  let sumDeltas = participants.reduce((s, p) => s + (deltasC[p] ?? 0), 0)

  // Splitwise exports can have tiny rounding drift after parsing to cents.
  // If the drift is within a very small threshold, absorb it into the first participant.
  if (sumDeltas !== 0) {
    const drift = sumDeltas
    const driftAbs = Math.abs(drift)
    if (driftAbs <= MAX_DELTA_DRIFT_CENTS && participants.length > 0) {
      const first = participants[0]!
      deltasC[first] = (deltasC[first] ?? 0) - drift
      sumDeltas = 0
    }
  }

  if (sumDeltas !== 0) {
    throw new Error('sum(deltas) != 0; row is inconsistent even after drift correction')
  }

  const P = participants
  const D = deltasC

  // 1) Splitwise Payment -> pure reimbursements
  if (isPaymentCategory) {
    return {
      groupExpenses: [],
      reimbursements: decomposeDeltasToReimbursements(description, P, D),
    }
  }

  // 2) Non-Payment categories
  if (totalC <= 0) {
    throw new Error('totalC must be positive for Splitwise rows')
  }

  const { sharesC, paidC } = buildShareAndPaidModelForGroup(totalC, P, D)
  const groupExpenses = allocateSharesToPayers(
    description,
    P,
    sharesC,
    paidC,
  )
  return { groupExpenses, reimbursements: [] }
}

const detectLanguageScore = (
  language: SplitwiseExportLanguage,
  recognizedFields: number,
) => {
  if (language === 'unknown' || recognizedFields < 3) return 0
  // Reward more recognized headers slightly to beat generic CSVs.
  return Math.min(0.95, 0.7 + recognizedFields * 0.05)
}

class SplitwiseCsvFormat implements ImportFormat {
  id = 'splitwise-csv'
  label = 'Splitwise CSV'
  priority = 90

  detect(content: string): number {
    const firstLine = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0)
    if (!firstLine) return 0
    const headerCells = splitCsvLine(firstLine)
    const detection = detectSplitwiseHeaders(headerCells)
    const recognizedFields = Object.keys(detection.fieldIndices).length
    return detectLanguageScore(detection.language, recognizedFields)
  }

  parseToInternal(content: string): {
    expenses: ExpenseFormValues[]
    group?: import('@/lib/imports/types').ImportParsedGroupInfo
    errors?: { row: number; message: string }[]
  } {
    const parsed = parseSplitwiseExportCsv(content)

    let participants = parsed.participantNames.map((name, index) => {
      const fallback = `Participant ${index + 1}`
      const normalized = normalizeName(name, fallback)
      return { id: normalized, name: normalized }
    })
    if (participants.length === 0) {
      participants = [{ id: 'Participant 1', name: 'Participant 1' }]
    }
    const participantIds = participants.map((p) => p.id)

    const errors: { row: number; message: string }[] = [
      ...parsed.errors,
      ...parsed.headerErrors.map((message) => ({ row: 1, message })),
    ]
    const expenses: ExpenseFormValues[] = []
    let groupCurrency = ''

    for (const row of parsed.rows) {
      if (!groupCurrency && row.currency) {
        groupCurrency = row.currency
      }

      const expenseDate = new Date(row.date)
      if (Number.isNaN(expenseDate.getTime())) {
        errors.push({
          row: row.rowNumber,
          message: 'Invalid expense date',
        })
        continue
      }

      const totalC = Math.round(row.amount * 100)

      // Build deltas in cents using canonical participant ids.
      const deltasC: Deltas = {}
      for (const id of participantIds) {
        const balance = row.participantBalances[id] ?? 0
        deltasC[id] = Math.round(balance * 100)
      }

      const mappedCategory = mapSplitwiseCategoryLabel(
        row.category,
        parsed.language,
      )
      const isPaymentCategory =
        mappedCategory?.grouping === 'Uncategorized' &&
        mappedCategory?.name === 'Payment'

      let parsedRow: ParsedRowModel
      try {
        parsedRow = parseExportRow(
          row.description || 'Imported expense',
          isPaymentCategory,
          totalC,
          participantIds,
          deltasC,
        )
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Failed to interpret Splitwise row'
        errors.push({ row: row.rowNumber, message })
        continue
      }

      // Group expenses -> normal expenses with BY_AMOUNT split.
      for (const ge of parsedRow.groupExpenses) {
        expenses.push({
          expenseDate,
          title: ge.description,
          category: mappedCategory?.id ?? 0,
          amount: ge.totalC,
          originalAmount: undefined,
          originalCurrency: row.currency || undefined,
          conversionRate: undefined,
          paidBy: ge.payer,
          paidFor: Object.entries(ge.sharesC).map(([participant, share]) => ({
            participant,
            shares: share,
            originalAmount: undefined,
          })),
          splitMode: 'BY_AMOUNT',
          saveDefaultSplittingOptions: false,
          isReimbursement: false,
          documents: [],
          notes: undefined,
          recurrenceRule: 'NONE',
        })
      }

      // Reimbursements -> isReimbursement:true with BY_AMOUNT split.
      for (const r of parsedRow.reimbursements) {
        expenses.push({
          expenseDate,
          title: r.description,
          category: mappedCategory?.id ?? 0,
          amount: r.amountC,
          originalAmount: undefined,
          originalCurrency: row.currency || undefined,
          conversionRate: undefined,
          paidBy: r.payer,
          paidFor: [
            {
              participant: r.receiver,
              shares: r.amountC,
              originalAmount: undefined,
            },
          ],
          splitMode: 'BY_AMOUNT',
          saveDefaultSplittingOptions: false,
          isReimbursement: true,
          documents: [],
          notes: undefined,
          recurrenceRule: 'NONE',
        })
      }
    }

    return {
      expenses,
      group: {
        currency: groupCurrency || undefined,
        currencyCode: groupCurrency || undefined,
        participants,
      },
      errors,
    }
  }
}

export const splitwiseCsvFormat = new SplitwiseCsvFormat()
importFormats.register(splitwiseCsvFormat)
