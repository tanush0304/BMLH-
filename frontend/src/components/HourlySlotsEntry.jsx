import { useEffect, useRef, useState } from 'react'
import { Field, TextInput } from './FormSection'
import { generateHourlySlots, splitHourHistory } from '../utils/hourlySlots'
import { todayISO } from '../utils/dates'
import { employeeLabelForId } from '../utils/employeeLabel'
import {
  IDLE_CATEGORIES,
  totalIdle,
  validateIdle,
  slotDurations,
  computeReportTotals,
} from '../utils/productionReport'

/**
 * Shared hourly-entry grid for Production Data Entry and Manual Operations: one row
 * per hour of the selected shift (real clock-time label, display only --
 * only the slot number is ever stored as hour_slot), plus the original
 * "Add Hour" button for overtime beyond the shift's own slots.
 *
 * Since migration 010, "production log hours" carries its own log_date,
 * shift_code and employee_id per row (unique on log_id + log_date +
 * shift_code + hour_slot) -- a log can span many shifts/days, and
 * hour_slot means "slot within that shift", not "slot ever on this log".
 * So a slot counts as already-saved only when a row exists for THIS log,
 * TODAY's date, and the currently-selected shift at that slot number.
 * Rows from any other date/shift are history: shown as a collapsed
 * per-(date, shift) summary above the grid, never mistaken for today's
 * saved slots and never blocking today's grid from being fully fresh.
 *
 * Only rows with at least one non-blank field get included when "Save
 * Hours" is pressed -- a 0 counts as entered, a blank field does not, and
 * nothing is ever sent for a fully-blank row (production log totals
 * divides by rows saved, so a blank row would distort efficiency).
 *
 * If the shift's start/end can't be read, `generateHourlySlots` returns no
 * slots and this renders only the Add Hour fallback -- same as before this
 * feature existed, never an error.
 *
 * `resetKey` should change whenever a different log is started/resumed (so
 * stale drafts from a previous log never leak into a new one). Changing
 * `startTime`/`endTime` (i.e. the shift dropdown) while drafts exist asks
 * for confirmation before regenerating the grid, since that would
 * otherwise silently discard typed but unsaved values; with no drafts
 * entered it regenerates silently.
 *
 * `showIdle` (Production Data Entry only, migration 017) adds the paper Hourly
 * Production Report's 8 idle-minute categories + remarks per row, blocks
 * saving any row whose idle exceeds 60 min (or a short slot's own length),
 * and shows live footer totals -- accepted qty, idle, production time,
 * setting time (`settingTimeMin`) -- over today's saved + entered rows.
 */
export default function HourlySlotsEntry({
  startTime,
  endTime,
  shiftCode,
  logHours,
  employees = [],
  onSaveHours,
  onAddExtraHour,
  saving,
  resetKey,
  showIdle = false,
  settingTimeMin,
}) {
  const [drafts, setDrafts] = useState({}) // slot -> { qty_produced, qty_rejected, qty_rework }
  const [committedTimes, setCommittedTimes] = useState({ startTime, endTime })
  const prevResetKeyRef = useRef(resetKey)
  const prevPropsRef = useRef({ startTime, endTime })

  // Fresh log (new or different resume target) -- reset everything, no
  // confirmation needed, this is a clean slate.
  useEffect(() => {
    if (resetKey !== prevResetKeyRef.current) {
      prevResetKeyRef.current = resetKey
      prevPropsRef.current = { startTime, endTime }
      setDrafts({})
      setCommittedTimes({ startTime, endTime })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  // Same log, shift dropdown changed -- only regenerate if nothing's been
  // typed yet; otherwise ask first, and keep showing the old grid if they
  // say no.
  useEffect(() => {
    if (startTime === prevPropsRef.current.startTime && endTime === prevPropsRef.current.endTime) return
    prevPropsRef.current = { startTime, endTime }
    const hasDrafts = Object.values(drafts).some(
      (d) => d && Object.values(d).some((v) => v !== undefined && v !== '')
    )
    if (!hasDrafts) {
      setCommittedTimes({ startTime, endTime })
      return
    }
    const ok = window.confirm(
      'Changing the shift will regenerate the hour slots and discard any hours you have typed but not yet saved. Continue?'
    )
    if (ok) {
      setDrafts({})
      setCommittedTimes({ startTime, endTime })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTime, endTime])

  const { slots, capped } = generateHourlySlots({
    start_time: committedTimes.startTime,
    end_time: committedTimes.endTime,
  })

  const today = todayISO()
  // Only rows for THIS log, TODAY, THIS shift count as "saved" slots in the
  // live grid -- everything else is history (a different day and/or a
  // different shift this same log was worked under). See
  // utils/hourlySlots.js's splitHourHistory for why that's the right split.
  const { savedToday, historyList } = splitHourHistory({ logHours, today, shiftCode })
  const savedSlotNumbersToday = new Set(savedToday.map((h) => h.hour_slot))
  const highestKnownSlotToday = Math.max(slots.length, ...savedToday.map((h) => h.hour_slot), 0)

  const draftKeys = [
    'qty_produced',
    'qty_rejected',
    'qty_rework',
    ...(showIdle ? [...IDLE_CATEGORIES.map((c) => c.key), 'remarks'] : []),
  ]
  const durations = slotDurations({ start_time: committedTimes.startTime, end_time: committedTimes.endTime })

  function updateDraft(slot, field, value) {
    setDrafts((d) => ({ ...d, [slot]: { ...d[slot], [field]: value } }))
  }

  function isEntered(slot) {
    const d = drafts[slot]
    return !!d && draftKeys.some((k) => d[k] !== undefined && d[k] !== '')
  }

  const pendingSlots = slots.filter((s) => !savedSlotNumbersToday.has(s.slot))
  const anyEntered = pendingSlots.some((s) => isEntered(s.slot))
  const rowErrors = {}
  if (showIdle) {
    for (const s of pendingSlots) {
      if (!isEntered(s.slot)) continue
      const err = validateIdle(drafts[s.slot], durations[s.slot])
      if (err) rowErrors[s.slot] = err
    }
  }
  const hasRowErrors = Object.keys(rowErrors).length > 0

  const footer = showIdle
    ? computeReportTotals({
        rows: [
          ...savedToday,
          ...pendingSlots.filter((s) => isEntered(s.slot)).map((s) => ({ ...drafts[s.slot], hour_slot: s.slot })),
        ],
        durations,
        settingTimeMin,
      })
    : null

  async function handleSaveHours() {
    if (hasRowErrors) return
    const rows = pendingSlots
      .filter((s) => isEntered(s.slot))
      .map((s) => {
        const d = drafts[s.slot] ?? {}
        return {
          hour_slot: s.slot,
          qty_produced: d.qty_produced === '' || d.qty_produced === undefined ? 0 : Number(d.qty_produced),
          qty_rejected: d.qty_rejected === '' || d.qty_rejected === undefined ? 0 : Number(d.qty_rejected),
          qty_rework: d.qty_rework === '' || d.qty_rework === undefined ? 0 : Number(d.qty_rework),
          ...(showIdle ? idlePayload(d) : {}),
        }
      })
    if (rows.length === 0) return
    await onSaveHours(rows)
    setDrafts((d) => {
      const next = { ...d }
      for (const row of rows) delete next[row.hour_slot]
      return next
    })
  }

  function idlePayload(d) {
    const out = {}
    for (const c of IDLE_CATEGORIES) out[c.key] = d[c.key] === '' || d[c.key] === undefined ? 0 : Number(d[c.key])
    out.remarks = d.remarks?.trim() ? d.remarks.trim() : null
    return out
  }

  const [extraForm, setExtraForm] = useState({ qty_produced: '', qty_rejected: '', qty_rework: '' })
  const nextExtraSlot = highestKnownSlotToday + 1

  async function handleAddExtra() {
    if (nextExtraSlot > 12) return
    await onAddExtraHour({
      hour_slot: nextExtraSlot,
      qty_produced: extraForm.qty_produced === '' ? 0 : Number(extraForm.qty_produced),
      qty_rejected: extraForm.qty_rejected === '' ? 0 : Number(extraForm.qty_rejected),
      qty_rework: extraForm.qty_rework === '' ? 0 : Number(extraForm.qty_rework),
    })
    setExtraForm({ qty_produced: '', qty_rejected: '', qty_rework: '' })
  }

  const idleInputClass =
    'w-11 border border-gray-300 rounded px-1 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-bmlhblue/30'
  const inputClass =
    'w-16 border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-bmlhblue/30'

  return (
    <div className="space-y-2">
      {historyList.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
          <div className="bg-gray-50 text-gray-600 text-xs font-medium px-2 py-1.5 border-b border-gray-200">
            Earlier on this log (other days/shifts)
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="px-2 py-1 font-medium">Date</th>
                <th className="px-2 py-1 font-medium">Shift</th>
                <th className="px-2 py-1 font-medium">Employee(s)</th>
                <th className="px-2 py-1 font-medium">Hours</th>
                <th className="px-2 py-1 font-medium">Qty Produced</th>
              </tr>
            </thead>
            <tbody>
              {historyList.map((g) => (
                <tr key={`${g.log_date}|${g.shift_code}`} className="border-t border-gray-100 text-gray-600">
                  <td className="px-2 py-1">{g.log_date}</td>
                  <td className="px-2 py-1">{g.shift_code}</td>
                  <td className="px-2 py-1">{g.employees.map((id) => employeeLabelForId(id, employees)).join(', ')}</td>
                  <td className="px-2 py-1">{g.hours}</td>
                  <td className="px-2 py-1">{g.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {capped && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-1.5 rounded">
          This shift needs more than 12 hourly slots -- showing the first 12 only (production log hours allows up to
          hour_slot 12 per shift).
        </div>
      )}

      {slots.length === 0 ? (
        <div className="bg-gray-100 border border-gray-200 text-gray-600 text-xs px-3 py-1.5 rounded">
          No shift start/end time available to auto-generate hourly slots -- use Add Hour below for manual entry.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-md overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-left">
                <th className="px-2 py-1.5 font-medium">Hour</th>
                <th className="px-2 py-1.5 font-medium">Produced</th>
                <th className="px-2 py-1.5 font-medium">Rejected</th>
                <th className="px-2 py-1.5 font-medium">Rework</th>
                {showIdle && (
                  <>
                    {IDLE_CATEGORIES.map((c) => (
                      <th key={c.key} className="px-1 py-1.5 font-medium leading-tight" title="Idle minutes">
                        {c.label}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 font-medium leading-tight">Total Idle</th>
                    <th className="px-2 py-1.5 font-medium">Remarks</th>
                  </>
                )}
              </tr>
              {showIdle && (
                <tr className="bg-gray-50 text-[10px] text-gray-400 text-left">
                  <th colSpan={4} />
                  <th colSpan={IDLE_CATEGORIES.length + 1} className="px-1 pb-1 font-normal">
                    Idle time (minutes, max 60 per hour)
                  </th>
                  <th />
                </tr>
              )}
            </thead>
            <tbody>
              {slots.map((s) => {
                const saved = savedToday.find((h) => h.hour_slot === s.slot)
                const rowError = rowErrors[s.slot]
                return (
                  <tr key={s.slot} className={`border-t border-gray-100 ${rowError ? 'bg-red-50' : ''}`} title={rowError}>
                    <td className="px-2 py-1 text-gray-700">
                      {s.slot}. {s.label}
                    </td>
                    {saved ? (
                      <>
                        <td className="px-2 py-1 text-gray-500">{saved.qty_produced}</td>
                        <td className="px-2 py-1 text-gray-500">{saved.qty_rejected}</td>
                        <td className="px-2 py-1 text-gray-500">{saved.qty_rework}</td>
                        {showIdle && (
                          <>
                            {IDLE_CATEGORIES.map((c) => (
                              <td key={c.key} className="px-1 py-1 text-gray-500">{saved[c.key] ?? 0}</td>
                            ))}
                            <td className="px-2 py-1 text-gray-500 font-medium">{totalIdle(saved)}</td>
                            <td className="px-2 py-1 text-gray-500">{saved.remarks ?? ''}</td>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            className={inputClass}
                            value={drafts[s.slot]?.qty_produced ?? ''}
                            onChange={(e) => updateDraft(s.slot, 'qty_produced', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            className={inputClass}
                            value={drafts[s.slot]?.qty_rejected ?? ''}
                            onChange={(e) => updateDraft(s.slot, 'qty_rejected', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            className={inputClass}
                            value={drafts[s.slot]?.qty_rework ?? ''}
                            onChange={(e) => updateDraft(s.slot, 'qty_rework', e.target.value)}
                          />
                        </td>
                        {showIdle && (
                          <>
                            {IDLE_CATEGORIES.map((c) => (
                              <td key={c.key} className="px-1 py-1">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  aria-label={`${c.label} slot ${s.slot}`}
                                  className={idleInputClass}
                                  value={drafts[s.slot]?.[c.key] ?? ''}
                                  placeholder="0"
                                  onChange={(e) => updateDraft(s.slot, c.key, e.target.value)}
                                />
                              </td>
                            ))}
                            <td className={`px-2 py-1 font-medium ${rowError ? 'text-red-600' : 'text-gray-700'}`}>
                              {Number.isFinite(totalIdle(drafts[s.slot])) ? totalIdle(drafts[s.slot]) : '—'}
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="text"
                                aria-label={`Remarks slot ${s.slot}`}
                                className="w-32 border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-bmlhblue/30"
                                value={drafts[s.slot]?.remarks ?? ''}
                                onChange={(e) => updateDraft(s.slot, 'remarks', e.target.value)}
                              />
                            </td>
                          </>
                        )}
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {footer && (
            <div className="px-2 py-1.5 border-t border-gray-200 bg-gray-50 text-xs text-gray-600 flex flex-wrap gap-x-6 gap-y-1">
              <span>Total Accepted Qty: <strong className="num-highlight">{footer.accepted}</strong></span>
              <span>Total Idle Time: <strong className="num-highlight">{footer.idleMin} min</strong></span>
              <span>Total Production Time: <strong className="num-highlight">{footer.productionMin} min</strong></span>
              <span>Total Setting Time: <strong className="num-highlight">{footer.settingMin} min</strong></span>
            </div>
          )}
          {hasRowErrors && (
            <div className="px-2 py-1.5 border-t border-red-100 bg-red-50 text-xs text-red-700 space-y-0.5">
              {Object.entries(rowErrors).map(([slot, err]) => (
                <div key={slot}>Hour {slot}: {err}</div>
              ))}
            </div>
          )}
          <div className="px-2 py-1.5 border-t border-gray-100">
            <button
              onClick={handleSaveHours}
              disabled={saving || !anyEntered || hasRowErrors}
              className="bg-bmlhblue text-white rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40"
            >
              {saving ? 'Saving...' : 'Save Hours'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-md p-2 flex flex-wrap items-end gap-3">
        <Field label="Qty Produced" width="short">
          <TextInput
            type="number"
            value={extraForm.qty_produced}
            onChange={(e) => setExtraForm((f) => ({ ...f, qty_produced: e.target.value }))}
          />
        </Field>
        <Field label="Qty Rejected" width="short">
          <TextInput
            type="number"
            value={extraForm.qty_rejected}
            onChange={(e) => setExtraForm((f) => ({ ...f, qty_rejected: e.target.value }))}
          />
        </Field>
        <Field label="Qty Rework" width="short">
          <TextInput
            type="number"
            value={extraForm.qty_rework}
            onChange={(e) => setExtraForm((f) => ({ ...f, qty_rework: e.target.value }))}
          />
        </Field>
        <button
          onClick={handleAddExtra}
          disabled={saving || nextExtraSlot > 12}
          className="bg-bmlhslate text-white rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          title="For overtime beyond this shift's own hourly slots, today"
        >
          Add Hour {nextExtraSlot <= 12 ? nextExtraSlot : ''}
        </button>
      </div>
    </div>
  )
}
