/** Units used for display and input. Everything is stored internally as kcal. */
export type Units = 'kcal' | 'kJ'

export const KCAL_TO_KJ = 4.184

/** Application settings. Budgets are always stored in kcal. */
export interface Settings {
  /** Default daily calorie budget in kcal. */
  dailyBudgetKcal: number
  /** Display/input units. */
  units: Units
  /**
   * Per-weekday budget overrides in kcal, index 0 = Sunday … 6 = Saturday.
   * `null` means "use the default budget".
   */
  weekdayOverridesKcal: (number | null)[]
  /** First day of the week: 0 = Sunday, 1 = Monday. Default is Monday. */
  weekStartsOnDay: 0 | 1
}

/** A single logged calorie entry. */
export interface Entry {
  id: string
  amountKcal: number
  note: string
  /** ISO timestamp of when the entry was created. */
  createdAt: string
}

export interface NewEntryInput {
  amountKcal: number
  note?: string
}

/** Payload for editing an existing entry (same shape as adding one). */
export type EditEntryInput = NewEntryInput

/** Full persisted payload (settings + entries). */
export interface AppData {
  settings: Settings
  entries: Entry[]
}

export const DEFAULT_SETTINGS: Settings = {
  dailyBudgetKcal: 2000,
  units: 'kcal',
  weekdayOverridesKcal: [null, null, null, null, null, null, null],
  weekStartsOnDay: 1
}

/** Weekday indices (0 = Sunday … 6 = Saturday) in display order starting from the configured first day of week. */
export function orderedWeekdayIndices(weekStartsOnDay: 0 | 1): number[] {
  return Array.from({ length: 7 }, (_, i) => (weekStartsOnDay + i) % 7)
}

/** Index 0 = Sunday … 6 = Saturday (matches `Date#getDay`). */
export const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
] as const

/** Effective budget (kcal) for a given date, applying weekday overrides. */
export function effectiveBudgetKcal(settings: Settings, date: Date): number {
  const override = settings.weekdayOverridesKcal[date.getDay()] ?? null
  return override != null ? override : settings.dailyBudgetKcal
}

/** True when the given date uses a per-weekday override instead of the default. */
export function hasWeekdayOverride(settings: Settings, date: Date): boolean {
  return (settings.weekdayOverridesKcal[date.getDay()] ?? null) != null
}

/** Local date key `YYYY-MM-DD` for grouping entries by day. */
export function dateKeyOf(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parse a `YYYY-MM-DD` key into a local Date at midnight. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Convert an amount in the given display unit to kcal (for storage). */
export function toKcal(amount: number, units: Units): number {
  return units === 'kJ' ? amount / KCAL_TO_KJ : amount
}

/** Convert a stored kcal amount to the given display unit. */
export function fromKcal(kcal: number, units: Units): number {
  return units === 'kJ' ? kcal * KCAL_TO_KJ : kcal
}

/** Format a stored kcal amount for display in the given unit. */
export function formatAmount(kcal: number, units: Units): string {
  const value = fromKcal(kcal, units)
  return `${Math.round(value).toLocaleString()} ${units}`
}
