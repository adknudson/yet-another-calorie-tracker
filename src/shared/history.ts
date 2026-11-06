import { dateKeyOf, parseDateKey } from './types'
import type { Entry } from './types'

/** Total kcal per local day key (`YYYY-MM-DD`). */
export function aggregateByDay(entries: Entry[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const e of entries) {
    const d = new Date(e.createdAt)
    const key = dateKeyOf(d)
    totals.set(key, (totals.get(key) ?? 0) + e.amountKcal)
  }
  return totals
}

/** kcal logged in each hour (index 0–23) of the given day. */
export function aggregateByHour(entries: Entry[], dateKey: string): number[] {
  const hours = new Array<number>(24).fill(0)
  for (const e of entries) {
    if (dateKeyOf(new Date(e.createdAt)) === dateKey) {
      hours[new Date(e.createdAt).getHours()] += e.amountKcal
    }
  }
  return hours
}

/**
 * The 7 day keys of the calendar week containing `key`, in order starting
 * from the configured first day of the week (0 = Sunday, 1 = Monday).
 */
export function weekWindow(key: string, weekStartsOnDay: 0 | 1): string[] {
  const d = parseDateKey(key)
  const offset = (d.getDay() - weekStartsOnDay + 7) % 7
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset)
  return Array.from({ length: 7 }, (_, i) => dateKeyOf(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)))
}

/** All day keys of the calendar month (`month` is 0-based, like `Date#getMonth`). */
export function monthWindow(year: number, month: number): string[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: daysInMonth }, (_, i) => dateKeyOf(new Date(year, month, i + 1)))
}
