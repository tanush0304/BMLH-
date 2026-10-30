import { useEffect, useState } from 'react'
import { ClipboardCheck, CheckCircle2 } from 'lucide-react'
import { Field, TextInput } from './FormSection'
import { listChecklistItemsForMachine, listMaintenanceLogsForShift, listMaintenanceLogItems, createMaintenanceLog, addMaintenanceLogItem } from '../data/queries/maintenanceLogs'
import { DAILY, itemsForType, findLogFor, gateStatus, gateMessage, conditionFromTick } from '../utils/dailyChecklist'
import { employeeLabelForId } from '../utils/employeeLabel'
import { todayISO } from '../utils/dates'
import Banner from './Banner'

const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '')

/**
 * Daily checklist for machine + today + shift, embedded in Production Data
 * Entry before Start. Saves the same maintenance log + items as Checklist
 * Entry, once (unticked = Not OK); Not OK items are cleared by a supervisor
 * via Checklist Entry's edit. onStatusChange(status) reports the gateStatus
 * (null while loading) so the screen can enable Start.
 */
export default function DailyChecklistGate({ machineId, machineLabel, shiftCode, employeeId, employees, onStatusChange }) {
  const [dailyItems, setDailyItems] = useState(null)
  const [log, setLog] = useState(null)
  const [logItems, setLogItems] = useState([])
  const [ticks, setTicks] = useState({})
  const [notes, setNotes] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false) // stays after the toast is dismissed
  const date = todayISO()

  useEffect(() => {
    // The screen remounts this per machine + shift (key), so no reset here.
    let active = true
    ;(async () => {
      const [items, logs] = await Promise.all([listChecklistItemsForMachine(machineId), listMaintenanceLogsForShift(machineId, date, shiftCode)])
      const found = findLogFor(logs, { machineId, date, shiftCode, type: DAILY })
      const saved = found ? await listMaintenanceLogItems(found.id) : []
      if (!active) return
      setDailyItems(itemsForType(items, DAILY))
      setLog(found)
      setLogItems(saved)
    })().catch((e) => active && (setLoadFailed(true), setLoadError(e.message)))
    return () => {
      active = false
    }
  }, [machineId, shiftCode, date])

  // A failed lookup shows its error and doesn't block Start.
  const status = loadFailed ? 'no-items' : dailyItems ? gateStatus({ dailyItems, log, logItems }) : null
  useEffect(() => {
    onStatusChange?.(status)
  }, [status, onStatusChange])

  async function handleSave() {
    if (!employeeId) {
      setError('Pick the Employee before saving the checklist.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const created = await createMaintenanceLog({ machine_id: machineId, employee_id: employeeId, shift_code: shiftCode, log_date: date, maintenance_type: DAILY })
      const saved = []
      for (const item of dailyItems) {
        saved.push(
          await addMaintenanceLogItem({
            maintenance_log_id: created.id,
            checklist_item_id: item.id,
            condition: conditionFromTick(!!ticks[item.id]),
            observation: notes[item.id]?.trim() || null,
            action_taken: null,
          })
        )
      }
      setLog(created)
      setLogItems(saved)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loadFailed) return <Banner tone="error" message={loadError} onClose={() => setLoadError(null)} />
  if (!status) return <p className="sm:col-span-3 text-xs text-gray-400">Checking Daily checklist...</p>

  if (status === 'no-items') {
    return <p className="sm:col-span-3 text-xs text-amber-700" data-testid="daily-checklist">{gateMessage(status, machineLabel)}</p>
  }
  if (status === 'done') {
    return (
      <p className="sm:col-span-3 flex items-center gap-1 text-xs font-medium text-green-700" data-testid="daily-checklist">
        <CheckCircle2 size={14} /> ✓ Daily checklist done (by {employeeLabelForId(log.employee_id, employees)}, {timeOf(log.created_at)})
      </p>
    )
  }
  if (status === 'not-ok') {
    return <p className="sm:col-span-3 text-xs font-medium text-red-700" data-testid="daily-checklist">{gateMessage(status, machineLabel)}</p>
  }

  return (
    <div className="sm:col-span-3 rounded border border-[#CFE2F8] bg-white" data-testid="daily-checklist">
      <Banner tone="error" message={error} onClose={() => setError(null)} />
      <div className="flex items-center gap-2 border-b border-[#CFE2F8] bg-[#E3F0FD] px-3 py-2">
        <ClipboardCheck size={15} className="text-[#0A4CB0]" />
        <h3 className="text-sm font-semibold text-[#0A4CB0]">Daily Checklist – {machineLabel} (Shift {shiftCode})</h3>
      </div>
      <div className="divide-y divide-gray-100">
        {dailyItems.map((item) => (
          <div key={item.id} className="grid grid-cols-1 items-end gap-2 px-3 py-2 sm:grid-cols-3">
            <label className="flex items-center gap-2 pb-2 text-sm text-gray-700 sm:col-span-1">
              <input type="checkbox" checked={!!ticks[item.id]} onChange={(e) => setTicks((t) => ({ ...t, [item.id]: e.target.checked }))} />
              {item.checklist_item}
            </label>
            <Field label="Observation" className="sm:col-span-2">
              <TextInput value={notes[item.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [item.id]: e.target.value }))} />
            </Field>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 px-3 py-2">
        <button type="button" onClick={handleSave} disabled={saving} className="rounded bg-[#1669E0] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
          {saving ? 'Saving...' : 'Save Checklist'}
        </button>
        <span className="text-xs text-amber-700">{gateMessage(status, machineLabel)}</span>
      </div>
    </div>
  )
}
