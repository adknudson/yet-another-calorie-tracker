import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { formatAmount, parseDateKey, WEEKDAY_LABELS } from '../../shared/types'
import type { Entry, Settings } from '../../shared/types'
import { aggregateByDay, aggregateByHour, monthWindow, weekWindow } from '../../shared/history'

type Range = 'day' | 'week' | 'month'

interface BarDatum {
  /** Day key the bar belongs to. */
  key: string
  /** X-axis label (empty when this bar has none). */
  label: string
  /** Tooltip prefix, e.g. "Nov 4" or "Nov 4 · 14:00". */
  title: string
  valueKcal: number
  selectable: boolean
}

export interface HistoryChartProps {
  entries: Entry[]
  settings: Settings
  selectedKey: string
  todayKey: string
  onSelectDay: (key: string) => void
}

const W = 640
const H = 180
const PAD_TOP = 12
const PAD_BOTTOM = 22
const PAD_X = 6

function shortDate(key: string): string {
  return parseDateKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function HistoryChart({ entries, settings, selectedKey, todayKey, onSelectDay }: HistoryChartProps) {
  const [range, setRange] = useState<Range>('day')
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const bars = useMemo<BarDatum[]>(() => {
    switch (range) {
      case 'day': {
        const hours = aggregateByHour(entries, selectedKey)
        return hours.map((valueKcal, h) => ({
          key: selectedKey,
          label: h % 6 === 0 ? String(h) : '',
          title: `${shortDate(selectedKey)} · ${h}:00`,
          valueKcal,
          selectable: false
        }))
      }
      case 'week': {
        const totals = aggregateByDay(entries)
        return weekWindow(selectedKey, settings.weekStartsOnDay).map((key) => {
          const d = parseDateKey(key)
          return {
            key,
            label: WEEKDAY_LABELS[d.getDay()].slice(0, 2),
            title: shortDate(key),
            valueKcal: totals.get(key) ?? 0,
            selectable: true
          }
        })
      }
      case 'month': {
        const d = parseDateKey(selectedKey)
        const totals = aggregateByDay(entries)
        return monthWindow(d.getFullYear(), d.getMonth()).map((key, i) => {
          const dayNum = i + 1
          return {
            key,
            label: dayNum === 1 || dayNum % 5 === 0 ? String(dayNum) : '',
            title: shortDate(key),
            valueKcal: totals.get(key) ?? 0,
            selectable: true
          }
        })
      }
    }
  }, [range, entries, settings, selectedKey])

  // Calendar views show every day of the window, including upcoming days.
  const visibleBars = bars

  const meta = useMemo(() => {
    switch (range) {
      case 'day':
        return shortDate(selectedKey)
      case 'week': {
        const week = weekWindow(selectedKey, settings.weekStartsOnDay)
        return `${shortDate(week[0])} – ${shortDate(week[6])}, ${parseDateKey(week[6]).getFullYear()}`
      }
      case 'month': {
        const d = parseDateKey(selectedKey)
        return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      }
    }
  }, [range, selectedKey, settings.weekStartsOnDay])

  const weekSummary = useMemo(() => {
    if (range !== 'week') return null
    const totals = aggregateByDay(entries)
    let sumKcal = 0
    let daysWithEntries = 0
    for (const key of weekWindow(selectedKey, settings.weekStartsOnDay)) {
      if (totals.has(key)) {
        sumKcal += totals.get(key)!
        daysWithEntries++
      }
    }
    return daysWithEntries > 0 ? sumKcal / daysWithEntries : null
  }, [range, entries, selectedKey, settings])

  if (visibleBars.length === 0) {
    return (
      <details className="card history-card" open>
        <summary>History</summary>
        <p className="hint">Nothing to show yet.</p>
      </details>
    )
  }

  const maxValue = Math.max(...visibleBars.map((b) => b.valueKcal), settings.dailyBudgetKcal) * 1.15
  const plotW = W - PAD_X * 2
  const plotH = H - PAD_TOP - PAD_BOTTOM
  const slot = plotW / visibleBars.length
  const barW = Math.min(slot * 0.7, 40)
  const budgetY = PAD_TOP + plotH - (settings.dailyBudgetKcal / maxValue) * plotH

  function showTooltip(e: MouseEvent<SVGGElement>, b: BarDatum) {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setTooltip({
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      text: `${b.title} — ${formatAmount(b.valueKcal, settings.units)}`
    })
  }

  function activate(e: KeyboardEvent<SVGGElement>, b: BarDatum) {
    if (b.selectable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onSelectDay(b.key)
    }
  }

  return (
    <details className="card history-card" open>
      <summary>History</summary>
      <div className="range-tabs" role="tablist" aria-label="History range">
        {(['day', 'week', 'month'] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={range === r}
            className={range === r ? 'range-tab active' : 'range-tab'}
            onClick={() => {
              setRange(r)
              setTooltip(null)
            }}
          >
            {r[0].toUpperCase() + r.slice(1)}
          </button>
        ))}
      </div>
      <p className="hint history-meta">
        {meta} · — {formatAmount(settings.dailyBudgetKcal, settings.units)} daily budget
      </p>
      <div ref={wrapRef} className="history-chart-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${range === 'day' ? 'Daily' : range === 'week' ? 'Weekly' : 'Monthly'} history: ${meta}`}
          className="history-svg"
        >
          <line x1={PAD_X} y1={budgetY} x2={W - PAD_X} y2={budgetY} stroke="var(--muted)" strokeWidth={1} strokeDasharray="4 4" />
          {visibleBars.map((b, i) => {
            const barH = Math.max((b.valueKcal / maxValue) * plotH, b.valueKcal > 0 ? 4 : 2)
            const x = PAD_X + i * slot + (slot - barW) / 2
            const y = PAD_TOP + plotH - barH
            const highlighted = range !== 'day' && (b.key === todayKey || b.key === selectedKey)
            return (
              <g
                key={`${b.key}-${i}`}
                role={b.selectable ? 'button' : 'img'}
                tabIndex={b.selectable ? 0 : -1}
                aria-label={`${b.title}: ${formatAmount(b.valueKcal, settings.units)}`}
                className={b.selectable ? 'history-bar-btn' : undefined}
                onClick={() => b.selectable && onSelectDay(b.key)}
                onKeyDown={(e) => activate(e, b)}
                onMouseMove={(e) => showTooltip(e, b)}
                onMouseLeave={() => setTooltip(null)}
              >
                <rect x={x} y={y} width={barW} height={barH} rx={2} fill="var(--accent)" />
                {highlighted && (
                  <rect x={x - 1.5} y={y - 1.5} width={barW + 3} height={barH + 3} rx={3} fill="none" stroke="var(--text)" strokeWidth={1.5} />
                )}
              </g>
            )
          })}
          {visibleBars.map((b, i) =>
            b.label ? (
              <text key={`label-${i}`} x={PAD_X + i * slot + slot / 2} y={H - 6} textAnchor="middle" className="history-axis-label">
                {b.label}
              </text>
            ) : null
          )}
        </svg>
        {tooltip && (
          <div className="history-tooltip" style={{ left: tooltip.x, top: tooltip.y }} role="status">
            {tooltip.text}
          </div>
        )}
      </div>
      {weekSummary != null && (
        <p className="hint week-summary">{`avg ${formatAmount(weekSummary, settings.units)}/day`}</p>
      )}
    </details>
  )
}
