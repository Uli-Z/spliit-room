import fs from 'fs'
import path from 'path'

import { splitCsvLine } from '@/lib/csv-utils'
import {
  SplitwiseColumn,
  SplitwiseExportLanguage,
} from '@/lib/splitwise-types'

export type CategoryTranslation = {
  grouping: string
  name: string
  id: number
  label: string
  key: string
}

type MappingType = 'header' | 'group' | 'category'

type RawMappingRow = {
  type: MappingType
  language: SplitwiseExportLanguage
  key: string
  label: string
  targetGrouping?: string
  targetName?: string
  targetId?: number
}

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const mappingFilePath = path.join(
  process.cwd(),
  'data',
  'splitwise-mappings.csv',
)

const mappingRows: RawMappingRow[] = (() => {
  if (!fs.existsSync(mappingFilePath)) {
    return []
  }

  const raw = fs.readFileSync(mappingFilePath, 'utf8')
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const header = lines.shift()
  if (!header) return []

  return lines.map((line) => {
    const [
      type,
      rawLanguage,
      key,
      label,
      targetGrouping,
      targetName,
      targetIdValue,
    ] = splitCsvLine(line)

    const language: SplitwiseExportLanguage =
      rawLanguage === 'de' ? 'de' : rawLanguage === 'en' ? 'en' : 'unknown'

    const row: RawMappingRow = {
      type: type as MappingType,
      language,
      key,
      label,
    }

    if (targetGrouping) row.targetGrouping = targetGrouping
    if (targetName) row.targetName = targetName
    if (targetIdValue) {
      const parsed = Number(targetIdValue)
      if (!Number.isNaN(parsed)) {
        row.targetId = parsed
      }
    }

    return row
  })
})()

const supportedLanguages: SplitwiseExportLanguage[] = ['de', 'en']

const headerAliases: Record<
  SplitwiseExportLanguage,
  Partial<Record<SplitwiseColumn, string[]>>
> = {
  de: {},
  en: {},
  unknown: {},
}

const categoryByLabel: Record<
  SplitwiseExportLanguage,
  Record<string, CategoryTranslation>
> = {
  de: {},
  en: {},
  unknown: {},
}

const categoryByKey: Record<
  SplitwiseExportLanguage,
  Record<string, CategoryTranslation>
> = {
  de: {},
  en: {},
  unknown: {},
}

const groupLabels: Record<
  SplitwiseExportLanguage,
  Record<string, string>
> = {
  de: {},
  en: {},
  unknown: {},
}

for (const row of mappingRows) {
  if (!supportedLanguages.includes(row.language)) continue

  if (row.type === 'header') {
    const field = row.key as SplitwiseColumn
    const existing = headerAliases[row.language][field] ?? []
    headerAliases[row.language][field] = [...existing, row.label]
    continue
  }

  if (row.type === 'group') {
    const normalized = normalize(row.label)
    groupLabels[row.language][normalized] = row.key
    continue
  }

  const grouping =
    row.targetGrouping ?? row.key.split('/')[0] ?? row.key
  const name = row.targetName ?? row.key.split('/')[1] ?? ''
  const translation: CategoryTranslation = {
    grouping,
    name,
    id: row.targetId ?? 0,
    label: row.label,
    key: row.key,
  }

  const normalizedLabel = normalize(row.label)
  categoryByLabel[row.language][normalizedLabel] = translation
  categoryByKey[row.language][row.key] = translation
}

export const headerAliasesByLanguage = headerAliases
export const categoryTranslationsByLanguage = categoryByLabel
export const categoryTranslationsByKey = categoryByKey
export const groupLabelTranslations = groupLabels
