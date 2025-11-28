import {
  SplitwiseColumn,
  SplitwiseExportLanguage,
  detectSplitwiseHeaders,
} from '@/lib/splitwise-export-headers'
import { splitCsvLine } from '@/lib/csv-utils'

export type SplitwiseExportRow = {
  date: string
  description: string
  category: string
  amount: number
  currency: string
  participantBalances: Record<string, number>
  rowNumber: number
}

export type SplitwiseExportParseResult = {
  headers: string[]
  participantNames: string[]
  rows: SplitwiseExportRow[]
  language: SplitwiseExportLanguage
  fieldIndices: Record<SplitwiseColumn, number>
  headerErrors: string[]
  errors: { row: number; message: string }[]
}

function toNumber(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) return 0
  const normalized = trimmed.replace(/\s/g, '').replace(',', '.')
  const n = Number(normalized)
  return Number.isNaN(n) ? 0 : n
}

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const summaryIndicators = ['gesamtbilanz', 'gesamtsaldo', 'total balance', 'balance summary', 'totalbal', 'balance net']

const isSummaryRow = (description: string) => {
  const normalized = normalizeText(description)
  return summaryIndicators.some((indicator) => normalized.includes(indicator))
}

export function parseSplitwiseExportCsv(
  csv: string,
): SplitwiseExportParseResult {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)

  if (lines.length === 0) {
    return {
      headers: [],
      participantNames: [],
      rows: [],
      language: 'unknown',
      fieldIndices: {
        date: 0,
        description: 1,
        category: 2,
        cost: 3,
        currency: 4,
      },
      headerErrors: [],
      errors: [],
    }
  }

  const headerCells = splitCsvLine(lines[0])
  const headers = headerCells.map((h) => h.trim())

  const detectionResult = detectSplitwiseHeaders(headerCells)
  const headerErrors: string[] = []

  const defaultFieldIndices: Record<SplitwiseColumn, number> = {
    date: 0,
    description: 1,
    category: 2,
    cost: 3,
    currency: 4,
  }

  const fieldIndices: Record<SplitwiseColumn, number> = {
    date: defaultFieldIndices.date,
    description: defaultFieldIndices.description,
    category: defaultFieldIndices.category,
    cost: defaultFieldIndices.cost,
    currency: defaultFieldIndices.currency,
  }

  for (const field of Object.keys(fieldIndices) as SplitwiseColumn[]) {
    const detectedIndex = detectionResult.fieldIndices[field]
    if (
      detectedIndex !== undefined &&
      detectedIndex >= 0 &&
      detectedIndex < headerCells.length
    ) {
      fieldIndices[field] = detectedIndex
    } else {
      const fallback = Math.min(
        defaultFieldIndices[field],
        Math.max(0, headerCells.length - 1),
      )
      fieldIndices[field] = fallback
      if (detectionResult.missingFields.includes(field)) {
        headerErrors.push(
          `Missing header for ${field}; using column ${fallback + 1} as fallback`,
        )
      } else {
        headerErrors.push(
          `Falling back to column ${fallback + 1} for ${field} (header not recognized)`,
        )
      }
    }
  }

  const usedIndexes = Object.values(fieldIndices)
  const maxFieldIndex =
    usedIndexes.length > 0 ? Math.max(...usedIndexes) : defaultFieldIndices.currency
  const participantStartIndex = Math.min(
    headerCells.length,
    maxFieldIndex + 1,
  )
  const participantNames = headerCells
    .slice(participantStartIndex)
    .map((name) => name.trim())

  const rows: SplitwiseExportRow[] = []
  const errors: { row: number; message: string }[] = []

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    if (cells.length === 0 || cells.every((c) => c.trim() === '')) continue

    const date = (cells[fieldIndices.date] ?? '').trim()
    const description = (cells[fieldIndices.description] ?? '').trim()
    const category = (cells[fieldIndices.category] ?? '').trim()
    const amount = toNumber(cells[fieldIndices.cost] ?? '')
    const currency = (cells[fieldIndices.currency] ?? '').trim()

    const participantBalances: Record<string, number> = {}

    participantNames.forEach((name, index) => {
      const cellIndex = participantStartIndex + index
      const raw = cells[cellIndex] ?? ''
      participantBalances[name] = toNumber(raw)
    })

    if (!date || amount === 0 || !description) {
      if (amount === 0 && description && isSummaryRow(description)) {
        continue
      }
      let message = 'Missing or invalid date, amount or description'
      if (description) {
        message += ` for "${description}"`
      }
      errors.push({
        row: i + 1,
        message,
      })
      continue
    }

    rows.push({
      date,
      description,
      category,
      amount,
      currency,
      participantBalances,
      rowNumber: i + 1,
    })
  }

  return {
    headers,
    participantNames,
    rows,
    language: detectionResult.language,
    fieldIndices,
    headerErrors,
    errors,
  }
}
