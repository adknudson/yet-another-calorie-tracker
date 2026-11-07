import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  DEFAULT_SETTINGS,
  WEEKDAY_LABELS,
  dateKeyOf,
  effectiveBudgetKcal,
  formatAmount,
  fromKcal,
  hasWeekdayOverride,
  orderedWeekdayIndices,
  parseDateKey,
  toKcal
} from '../../shared/types'
import type { Entry, Settings, Units } from '../../shared/types'
import { createDataStore } from './storage'
import { HistoryChart } from './HistoryChart'

function shiftDateKey(key: string, days: number): string {
  const d = parseDateKey(key)
  d.setDate(d.getDate() + days)
  return dateKeyOf(d)
}

/** Current OS theme preference. */
function systemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function App() {
  const store = useMemo(() => createDataStore(), [])

  const [settings, setSettings] = useState<Settings | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState(() => dateKeyOf(new Date()))

  // Add-entry form
  const [amountInput, setAmountInput] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // Inline entry editing (drafts displayed in the currently selected unit)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  // Settings panel drafts (displayed in the currently selected unit)
  const [draftBudget, setDraftBudget] = useState('')
  const [draftUnits, setDraftUnits] = useState<Units>('kcal')
  const [draftOverrides, setDraftOverrides] = useState<string[]>(Array(7).fill(''))
  const [draftWeekStart, setDraftWeekStart] = useState<0 | 1>(DEFAULT_SETTINGS.weekStartsOnDay)
  // Theme draft ('system' = follow the OS preference).
  const [draftTheme, setDraftTheme] = useState<'system' | 'light' | 'dark'>('system')
  // Live OS light/dark preference (only meaningful while draftTheme is 'system').
  const [systemPref, setSystemPref] = useState<'light' | 'dark'>(systemTheme)
  const effectiveTheme: 'light' | 'dark' = draftTheme === 'system' ? systemPref : draftTheme
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  // Undo toast for deleted entries (auto-dismisses after ~5 s).
  const [undoToast, setUndoToast] = useState<Entry | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Danger-zone confirmation: 'entries' clears logged entries only, 'all' resets everything,
  // 'import' replaces all entries with the chosen file.
  const [confirming, setConfirming] = useState<'entries' | 'settings' | 'all' | 'import' | null>(null)

  // Data import/export feedback and pending (not yet confirmed) imported payload.
  const [dataFeedback, setDataFeedback] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null)
  const [pendingImportText, setPendingImportText] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    store
      .load()
      .then((data) => {
        setSettings(data.settings)
        setEntries(data.entries)
      })
      .catch((err: unknown) => setError(String(err)))
  }, [store])

  // Sync the settings drafts whenever saved settings change.
  useEffect(() => {
    if (!settings) return
    setDraftBudget(String(Math.round(fromKcal(settings.dailyBudgetKcal, settings.units))))
    setDraftUnits(settings.units)
    setDraftOverrides(
      settings.weekdayOverridesKcal.map((v) => (v == null ? '' : String(Math.round(fromKcal(v, settings.units)))))
    )
    setDraftWeekStart(settings.weekStartsOnDay)
    // No saved theme (fresh install) → 'system'.
    setDraftTheme(settings.theme ?? 'system')
  }, [settings])

  // Apply the effective theme to <html> so the CSS variables switch.
  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme
  }, [effectiveTheme])

  // Track live OS preference changes; effective while the draft is 'system'.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemPref(systemTheme())
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const today = new Date()
  const todayKey = dateKeyOf(today)
  const effectiveBudget = settings ? effectiveBudgetKcal(settings, today) : 0
  const consumedToday = useMemo(
    () => entries.reduce((sum, e) => (dateKeyOf(new Date(e.createdAt)) === todayKey ? sum + e.amountKcal : sum), 0),
    [entries, todayKey]
  )
  const remaining = effectiveBudget - consumedToday
  const progressPct = effectiveBudget > 0 ? Math.min(100, (consumedToday / effectiveBudget) * 100) : 0

  const dayEntries = useMemo(
    () =>
      entries
        .filter((e) => dateKeyOf(new Date(e.createdAt)) === selectedKey)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [entries, selectedKey]
  )
  const dayTotal = dayEntries.reduce((sum, e) => sum + e.amountKcal, 0)

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!settings) return
    const raw = Number(amountInput.replace(',', '.'))
    if (!Number.isFinite(raw) || raw <= 0) {
      setFormError('Enter a positive amount.')
      return
    }
    try {
      const entry = await store.addEntry({ amountKcal: toKcal(raw, settings.units), note: noteInput })
      setEntries((prev) => [...prev, entry])
      setAmountInput('')
      setNoteInput('')
      setFormError(null)
    } catch (err: unknown) {
      setFormError(String(err))
    }
  }

  async function handleDelete(id: string): Promise<void> {
    const removed = entries.find((e) => e.id === id)
    try {
      await store.deleteEntry(id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
      if (editingId === id) {
        cancelEdit()
      }
      if (removed != null) {
        showUndoToast(removed)
      }
    } catch (err: unknown) {
      setError(String(err))
    }
  }

  function showUndoToast(entry: Entry): void {
    if (undoTimerRef.current != null) clearTimeout(undoTimerRef.current)
    setUndoToast(entry)
    undoTimerRef.current = setTimeout(() => setUndoToast(null), 5000)
  }

  async function handleUndoDelete(): Promise<void> {
    const entry = undoToast
    if (entry == null) return
    setUndoToast(null)
    if (undoTimerRef.current != null) clearTimeout(undoTimerRef.current)
    try {
      await store.restoreEntry(entry)
      setEntries((prev) => [...prev, entry])
    } catch (err: unknown) {
      setError(String(err))
    }
  }

  // Clear the pending toast timer on unmount.
  useEffect(
    () => () => {
      if (undoTimerRef.current != null) clearTimeout(undoTimerRef.current)
    },
    []
  )

  function startEdit(entry: Entry): void {
    if (!settings) return
    setEditingId(entry.id)
    setEditAmount(String(Math.round(fromKcal(entry.amountKcal, settings.units))))
    setEditNote(entry.note ?? '')
    setEditError(null)
  }

  function cancelEdit(): void {
    setEditingId(null)
    setEditAmount('')
    setEditNote('')
    setEditError(null)
  }

  async function handleSaveEdit(): Promise<void> {
    if (!settings || editingId === null) return
    const raw = Number(editAmount.replace(',', '.'))
    if (!Number.isFinite(raw) || raw <= 0) {
      setEditError('Enter a positive amount.')
      return
    }
    try {
      const entry = await store.editEntry(editingId, {
        amountKcal: toKcal(raw, settings.units),
        note: editNote
      })
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? entry : e)))
      cancelEdit()
    } catch (err: unknown) {
      setEditError(String(err))
    }
  }

  function handleUnitsChange(next: Units): void {
    if (next === draftUnits) return
    const convert = (s: string): string => {
      const t = s.trim()
      if (t === '') return ''
      const n = Number(t)
      if (!Number.isFinite(n)) return s
      return String(Math.round(fromKcal(toKcal(n, draftUnits), next)))
    }
    setDraftBudget(convert(draftBudget))
    setDraftOverrides(draftOverrides.map(convert))
    setDraftUnits(next)
  }

  async function handleSaveSettings(): Promise<void> {
    if (!settings) return
    const budgetKcal = toKcal(Number(draftBudget.replace(',', '.')), draftUnits)
    if (!Number.isFinite(budgetKcal) || budgetKcal <= 0) {
      setSettingsError('Daily budget must be a positive number.')
      return
    }
    const overrides: (number | null)[] = draftOverrides.map((s) => {
      const t = s.trim()
      if (t === '') return null
      const kcal = toKcal(Number(t), draftUnits)
      return Number.isFinite(kcal) && kcal >= 0 ? Math.round(kcal) : null
    })
    try {
      const next = await store.updateSettings({
        dailyBudgetKcal: Math.round(budgetKcal),
        units: draftUnits,
        weekdayOverridesKcal: overrides,
        weekStartsOnDay: draftWeekStart,
        theme: draftTheme
      })
      setSettings(next)
      setSettingsError(null)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    } catch (err: unknown) {
      setSettingsError(String(err))
    }
  }

  async function handleClearEntries(): Promise<void> {
    try {
      await store.clearEntries()
      setEntries([])
      if (editingId !== null) {
        cancelEdit()
      }
      setConfirming(null)
    } catch (err: unknown) {
      setError(String(err))
    }
  }

  async function handleResetSettings(): Promise<void> {
    try {
      const next = await store.resetSettings()
      setSettings(next)
      if (editingId !== null) {
        cancelEdit()
      }
      setConfirming(null)
    } catch (err: unknown) {
      setError(String(err))
    }
  }

  async function handleClearAllData(): Promise<void> {
    try {
      const next = await store.clearAllData()
      setSettings(next)
      setEntries([])
      if (editingId !== null) {
        cancelEdit()
      }
      setConfirming(null)
    } catch (err: unknown) {
      setError(String(err))
    }
  }

  function flashDataFeedback(kind: 'ok' | 'error', message: string): void {
    setDataFeedback({ kind, message })
    setTimeout(() => setDataFeedback(null), 4000)
  }

  async function handleExport(): Promise<void> {
    try {
      const result = await store.exportData()
      if (result == null) return // User cancelled the save dialog.
      const word = entries.length === 1 ? 'entry' : 'entries'
      flashDataFeedback('ok', `Exported ${entries.length} ${word} to ${result}.`)
    } catch (err: unknown) {
      flashDataFeedback('error', String(err))
    }
  }

  function handleImportFileSelected(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    // Reset so selecting the same file again re-triggers this handler.
    event.target.value = ''
    if (file == null) return
    file
      .text()
      .then((text) => {
        setPendingImportText(text)
        setConfirming('import')
      })
      .catch(() => flashDataFeedback('error', 'Could not read the selected file.'))
  }

  async function handleConfirmImport(): Promise<void> {
    if (pendingImportText == null) return
    try {
      const imported = await store.importData(pendingImportText)
      setEntries(imported)
      if (editingId !== null) {
        cancelEdit()
      }
      setPendingImportText(null)
      setConfirming(null)
      const word = imported.length === 1 ? 'entry' : 'entries'
      flashDataFeedback('ok', `Imported ${imported.length} ${word}.`)
    } catch (err: unknown) {
      setPendingImportText(null)
      setConfirming(null)
      flashDataFeedback('error', String(err))
    }
  }

  function handleCancelImport(): void {
    setPendingImportText(null)
    setConfirming(null)
  }

  const selectedDate = parseDateKey(selectedKey)
  const selectedBudget = settings ? effectiveBudgetKcal(settings, selectedDate) : 0

  return (
    <main className="app">
      <header>
        <h1>Yet Another Calorie Tracker</h1>
      </header>

      {error && <div className="card error">Something went wrong: {error}</div>}

      {!settings && !error && <div className="card">Loading…</div>}

      {settings && (
        <>
          <section className="card today-card">
            <h2>Today</h2>
            <p className="today-date">
              {today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              {hasWeekdayOverride(settings, today) && (
                <span className="badge">{WEEKDAY_LABELS[today.getDay()]} override</span>
              )}
            </p>
            <div className="budget-row">
              <div>
                <span className="label">Budget</span>
                <span className="value">{formatAmount(effectiveBudget, settings.units)}</span>
              </div>
              <div>
                <span className="label">Consumed</span>
                <span className="value">{formatAmount(consumedToday, settings.units)}</span>
              </div>
              <div>
                <span className="label">Remaining</span>
                <span className={`value ${remaining < 0 ? 'negative' : ''}`}>
                  {remaining < 0 ? `−${formatAmount(Math.abs(remaining), settings.units)}` : formatAmount(remaining, settings.units)}
                </span>
              </div>
            </div>
            <div className="progress" role="progressbar" aria-valuenow={Math.round(progressPct)} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </section>

          <section className="card">
            <h2>Add entry</h2>
            <form onSubmit={handleAdd} className="entry-form">
              <label>
                Amount ({settings.units}) *
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="e.g. 450"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  required
                />
              </label>
              <label className="note-field">
                Note (optional)
                <input
                  type="text"
                  maxLength={500}
                  placeholder="e.g. lunch — pasta with chicken"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                />
              </label>
              <button type="submit">Add</button>
            </form>
            {formError && <p className="error-text">{formError}</p>}
          </section>

          <section className="card">
            <div className="day-nav">
              <button type="button" onClick={() => setSelectedKey((k) => shiftDateKey(k, -1))} aria-label="Previous day">
                ‹
              </button>
              <span className="day-title">
                {selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              </span>
              <button type="button" onClick={() => setSelectedKey((k) => (k === todayKey ? k : todayKey))}>
                Today
              </button>
              <button type="button" onClick={() => setSelectedKey((k) => shiftDateKey(k, 1))} aria-label="Next day">
                ›
              </button>
            </div>

            {dayEntries.length === 0 ? (
              <p className="empty">No entries for this day.</p>
            ) : (
              <ul className="entry-list">
                {dayEntries.map((e) => (
                  <li key={e.id} className={editingId === e.id ? 'editing' : ''}>
                    {editingId === e.id ? (
                      <>
                        <form
                          className="edit-form"
                          onSubmit={(ev) => {
                            ev.preventDefault()
                            void handleSaveEdit()
                          }}
                        >
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            aria-label={`Amount in ${settings.units}`}
                            placeholder={settings.units}
                            value={editAmount}
                            onChange={(ev) => setEditAmount(ev.target.value)}
                            required
                          />
                          <input
                            type="text"
                            maxLength={500}
                            aria-label="Note (optional)"
                            placeholder="Note (optional)"
                            value={editNote}
                            onChange={(ev) => setEditNote(ev.target.value)}
                          />
                          <button type="submit">Save</button>
                          <button type="button" className="btn-secondary" onClick={cancelEdit}>
                            Cancel
                          </button>
                        </form>
                        {editError && <p className="error-text">{editError}</p>}
                      </>
                    ) : (
                      <>
                        <span className="entry-time">
                          {new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="entry-amount">{formatAmount(e.amountKcal, settings.units)}</span>
                        <span className="entry-note">{e.note ?? ''}</span>
                        <button type="button" className="icon-btn" onClick={() => startEdit(e)} aria-label="Edit entry">
                          ✎
                        </button>
                        <button type="button" className="icon-btn" onClick={() => void handleDelete(e.id)} aria-label="Delete entry">
                          ✕
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="day-summary">
              <span>
                Budget: {formatAmount(selectedBudget, settings.units)}
                {hasWeekdayOverride(settings, selectedDate) && (
                  <span className="badge">{WEEKDAY_LABELS[selectedDate.getDay()]} override</span>
                )}
              </span>
              {dayEntries.length > 0 && <span>Total: {formatAmount(dayTotal, settings.units)}</span>}
            </div>
          </section>

          <HistoryChart
            entries={entries}
            settings={settings}
            selectedKey={selectedKey}
            todayKey={todayKey}
            onSelectDay={setSelectedKey}
          />

          <details className="card settings-card">
            <summary>Settings</summary>
            <div className="settings-grid">
              <label>
                Daily budget ({draftUnits})
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={draftBudget}
                  onChange={(e) => setDraftBudget(e.target.value)}
                />
              </label>
              <label>
                Units
                <select value={draftUnits} onChange={(e) => handleUnitsChange(e.target.value as Units)}>
                  <option value="kcal">kcal</option>
                  <option value="kJ">kJ</option>
                </select>
              </label>
              <label>
                Week starts on
                <select
                  value={String(draftWeekStart)}
                  onChange={(e) => setDraftWeekStart(Number(e.target.value) === 0 ? 0 : 1)}
                >
                  <option value="1">Monday</option>
                  <option value="0">Sunday</option>
                </select>
              </label>
              <label>
                Theme
                <select
                  value={draftTheme}
                  onChange={(e) => setDraftTheme(e.target.value as 'system' | 'light' | 'dark')}
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
            </div>

            <h3>Weekday overrides</h3>
            <p className="hint">Leave empty to use the default budget for that day.</p>
            <div className="overrides-grid">
              {orderedWeekdayIndices(settings.weekStartsOnDay).map((i) => (
                <label key={i}>
                  {WEEKDAY_LABELS[i]}
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    placeholder={String(Math.round(fromKcal(settings.dailyBudgetKcal, draftUnits)))}
                    value={draftOverrides[i]}
                    onChange={(e) =>
                      setDraftOverrides((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                    }
                  />
                </label>
              ))}
            </div>

            <div className="settings-actions">
              <button type="button" onClick={() => void handleSaveSettings()}>
                Save settings
              </button>
              {savedFlash && <span className="saved-flash">Saved ✓</span>}
            </div>

            <h3>Data</h3>
            <p className="hint">Export and import your logged entries as a JSON file.</p>
            <div className="settings-actions">
              <button type="button" onClick={() => void handleExport()}>
                Export entries
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()}>
                Import entries
              </button>
              {/* Hidden input: the Import button opens it; confirmation happens in the bar below. */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(e) => handleImportFileSelected(e)}
              />
            </div>

            {dataFeedback != null && (
              <p className={dataFeedback.kind === 'ok' ? 'saved-flash' : 'error-text'}>{dataFeedback.message}</p>
            )}

            <h3>Danger zone</h3>
            <p className="hint">These actions cannot be undone.</p>
            <div className="settings-actions danger-actions">
              <button type="button" className="btn-danger" onClick={() => setConfirming('settings')}>
                Reset settings
              </button>
              <button type="button" className="btn-danger" onClick={() => setConfirming('entries')}>
                Clear entries
              </button>
              <button type="button" className="btn-danger" onClick={() => setConfirming('all')}>
                Clear all data
              </button>
            </div>

            {confirming === 'import' && (
              <div className="confirm-bar" role="alertdialog" aria-label="Import entries confirmation">
                <span>Replace all logged entries with the ones from the selected file?</span>
                <button type="button" className="btn-danger" onClick={() => void handleConfirmImport()}>
                  Yes, replace entries
                </button>
                <button type="button" className="btn-secondary" onClick={handleCancelImport}>
                  Cancel
                </button>
              </div>
            )}
            {confirming === 'entries' && (
              <div className="confirm-bar" role="alertdialog" aria-label="Clear entries confirmation">
                <span>Delete all logged entries? Your settings will be kept.</span>
                <button type="button" className="btn-danger" onClick={() => void handleClearEntries()}>
                  Yes, clear entries
                </button>
                <button type="button" className="btn-secondary" onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </div>
            )}
            {confirming === 'settings' && (
              <div className="confirm-bar" role="alertdialog" aria-label="Reset settings confirmation">
                <span>Reset your settings to defaults? Your logged entries will be kept.</span>
                <button type="button" className="btn-danger" onClick={() => void handleResetSettings()}>
                  Yes, reset settings
                </button>
                <button type="button" className="btn-secondary" onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </div>
            )}
            {confirming === 'all' && (
              <div className="confirm-bar" role="alertdialog" aria-label="Clear all data confirmation">
                <span>Delete all entries and reset settings to defaults?</span>
                <button type="button" className="btn-danger" onClick={() => void handleClearAllData()}>
                  Yes, clear everything
                </button>
                <button type="button" className="btn-secondary" onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </div>
            )}

            {settingsError && <p className="error-text">{settingsError}</p>}
          </details>
        </>
      )}

      {undoToast != null && (
        <div className="toast" role="status">
          <span>Entry deleted</span>
          <button type="button" onClick={() => void handleUndoDelete()}>
            Undo
          </button>
        </div>
      )}

      <footer>
        Built with Electron, electron-vite, React and TypeScript. All data is stored locally.
        <br />
        Don&apos;t know how many calories you need? Start here:{' '}
        <a href="https://www.calculator.net/calorie-calculator.html" target="_blank" rel="noreferrer">
          Calorie calculator
        </a>
        <br />
        View the {' '}
        <a href="https://github.com/adknudson/yet-another-calorie-tracker" target="_blank" rel="noreferrer">
          source on GitHub
        </a>
      </footer>
    </main>
  )
}
