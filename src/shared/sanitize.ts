import type { Entry, ExportPayload } from './types'

/** Validate an array of entries; drops items with a bad id or amount. */
export function sanitizeEntries(input: unknown): Entry[] {
  if (!Array.isArray(input)) return []
  const now = new Date().toISOString()
  return input.flatMap((raw) => {
    const e = raw as Partial<Entry>
    if (typeof e.id !== 'string' || typeof e.amountKcal !== 'number' || !Number.isFinite(e.amountKcal)) {
      return []
    }
    return [
      {
        id: e.id,
        amountKcal: Math.round(e.amountKcal),
        note: typeof e.note === 'string' ? e.note : '',
        createdAt: typeof e.createdAt === 'string' ? e.createdAt : now
      }
    ]
  })
}

/**
 * Parse and validate an exported payload (JSON string or object).
 * Throws a descriptive Error when the file is not usable.
 */
export function parseExportPayload(input: unknown): ExportPayload {
  let parsed = input
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      throw new Error('File is not valid JSON.')
    }
  }
  const obj = (parsed ?? {}) as Partial<ExportPayload>
  if (obj.version !== 1 || !Array.isArray(obj.entries)) {
    throw new Error('Not a valid export file (expected version 1 with an entries array).')
  }
  return { version: 1, entries: sanitizeEntries(obj.entries) }
}
