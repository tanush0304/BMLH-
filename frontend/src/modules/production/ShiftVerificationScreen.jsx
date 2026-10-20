import { useEffect, useState } from 'react'
import { CalendarCheck, Clock3 } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import StatusPill from '../../components/StatusPill'
import SearchableSelect from '../../components/SearchableSelect'
import EmployeeSelect from '../../components/EmployeeSelect'
import { listEmployees } from '../../data/queries/employees'
import { listShifts } from '../../data/queries/shifts'
import { listMachines } from '../../data/queries/machines'
import { listAllStages } from '../../data/queries/routeCards'
import { listOrdersByPrd } from '../../data/queries/customerOrders'
import { listProducts } from '../../data/queries/products'
import { getCurrentUserId } from '../../data/queries/currentUser'
import {
  listHoursForDateShift,
  listLogsByIds,
  listShiftVerificationsForDateShift,
  setShiftVerification,
} from '../../data/queries/shiftVerifications'
import { useAppUsers } from '../../components/StockEditPanel'
import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import { todayISO } from '../../utils/dates'
import { subItemLabel } from '../../utils/constants'
import { machineOptionLabel } from '../../utils/machineLabel'
import { substituteLine } from '../../utils/machineEligibility'
import { employeeLabelForId } from '../../utils/employeeLabel'
import { acceptedFromHour } from '../../utils/qtyLimits'
import { totalIdle } from '../../utils/productionReport'
import { SHIFT_STATUSES, buildShiftRows, filterShiftRows, approveBlockedReason } from '../../utils/shiftVerification'
import { updateHourCorrection } from '../../data/queries/shiftVerifications'
import { IDLE_CATEGORIES } from '../../utils/productionReport'
import {
  CORRECTION_FIELDS,
  canCorrectRole,
  correctBlockedReason,
  correctionChanges,
  correctionError,
  saveCorrection,
  correctedByText,
  editedHourTitle,
} from '../../utils/shiftCorrection'

const draftFromHour = (h) => Object.fromEntries(CORRECTION_FIELDS.map((k) => [k, h[k] ?? (k === 'remarks' ? '' : 0)]))

const MACHINE_COLUMNS = [
  { key: 'machine', label: 'Machine' },
  { key: 'status', label: 'Status', type: 'status' },
  { key: 'prd_no', label: 'PRD No' },
  { key: 'stage', label: 'Stage' },
  { key: 'part', label: 'Part' },
  { key: 'operator', label: 'Operator' },
  { key: 'hours_entered', label: 'Hours Entered' },
  { key: 'produced', label: 'Produced' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'rework', label: 'Rework' },
  { key: 'idle_min', label: 'Idle (min)' },
  { key: 'decided_by', label: 'Verified By' },
  { key: 'decided_at', label: 'Verified At' },
  { key: 'reject_reason', label: 'Reject Reason' },
]

const MANUAL_COLUMNS = [
  { key: 'operation', label: 'Operation' },
  { key: 'status', label: 'Status', type: 'status' },
  { key: 'prd_no', label: 'PRD No' },
  { key: 'stage', label: 'Stage' },
  { key: 'operator', label: 'Operator' },
  { key: 'produced', label: 'Qty' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'decided_by', label: 'Verified By' },
  { key: 'decided_at', label: 'Verified At' },
  { key: 'reject_reason', label: 'Reject Reason' },
]

// Print: both sections in one sheet; manual rows show "Manual" as machine.
const EXPORT_COLUMNS = [{ key: 'section', label: 'Section' }, ...MACHINE_COLUMNS]

export default function ShiftVerificationScreen({ role }) {
  const appUsers = useAppUsers()
  const [shifts, setShifts] = useState([])
  const [machines, setMachines] = useState([])
  const [employees, setEmployees] = useState([])
  const [lookups, setLookups] = useState({ stages: [], orders: [], products: [] })
  const [currentUserId, setCurrentUserId] = useState(null)

  const [logDate, setLogDate] = useState(todayISO())
  const [shiftCode, setShiftCode] = useState('')
  const [machineFilter, setMachineFilter] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [data, setData] = useState({ logs: [], hours: [], verifications: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [searchMachines, setSearchMachines] = useState('')
  const [searchManual, setSearchManual] = useState('')

  const [selectedKey, setSelectedKey] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [acting, setActing] = useState(false)
  // 035: correcting a Rejected shift of a closed log (hour id -> draft).
  const [drafts, setDrafts] = useState(null)
  const [correctSaving, setCorrectSaving] = useState(false)

  useEffect(() => {
    Promise.all([listShifts(), listMachines(), listEmployees(), listAllStages(), listOrdersByPrd(), listProducts(), getCurrentUserId()])
      .then(([shf, machs, emps, stages, orders, products, uid]) => {
        setShifts(shf)
        setMachines(machs)
        setEmployees(emps)
        setLookups({ stages, orders, products })
        setCurrentUserId(uid)
      })
      .catch((e) => setError(e.message))
  }, [])

  async function loadShift(date, shift) {
    if (!date || !shift) {
      setData({ logs: [], hours: [], verifications: [] })
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [hours, verifications] = await Promise.all([
        listHoursForDateShift(date, shift),
        listShiftVerificationsForDateShift(date, shift),
      ])
      const logs = await listLogsByIds([...new Set(hours.map((h) => h.log_id))])
      setData({ logs, hours, verifications })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setSelectedKey(null)
    setDrafts(null)
    setRejectReason('')
    setNotice(null)
    loadShift(logDate, shiftCode)
  }, [logDate, shiftCode])

  const ready = Boolean(logDate && shiftCode)
  const { machineRows, manualRows } = ready
    ? buildShiftRows({ logDate, shiftCode, machines, employees, appUsers, ...lookups, ...data })
    : { machineRows: [], manualRows: [] }

  const filters = { machineId: machineFilter, employeeId: employeeFilter, status: statusFilter }
  const search = (rows, q) => {
    if (!q) return rows
    const needle = q.toLowerCase()
    return rows.filter((r) =>
      [r.machine, r.prd_no, r.stage, r.part, r.operator, r.status].some((v) => String(v ?? '').toLowerCase().includes(needle))
    )
  }
  const shownMachineRows = search(filterShiftRows(machineRows, filters), searchMachines)
  // Manual logs have no machine: a Machine filter hides this section.
  const shownManualRows = machineFilter ? [] : search(filterShiftRows(manualRows, filters), searchManual)

  const selected = [...machineRows, ...manualRows].find((r) => r.key === selectedKey) ?? null
  const labelOf = (id) => {
    const m = machines.find((x) => x.machine_id === id)
    return m ? machineOptionLabel(m) : id
  }
  const substituteText = selected
    ? substituteLine({
        actualId: selected.machine_id,
        plannedId: selected.planned_machine_id,
        actualLabel: labelOf(selected.machine_id),
        plannedLabel: labelOf(selected.planned_machine_id),
        reason: selected.substitute_reason,
        note: selected.substitute_reason_note,
      })
    : ''
  const blockedReason = selected ? approveBlockedReason(selected, currentUserId) : null
  const showCorrect = canCorrectRole(role) && Boolean(selected?.log_id) && !selected?.log_is_open && selected?.status !== 'Approved'
  const correctBlock = showCorrect ? correctBlockedReason(selected, role, currentUserId) : null
  const correcting = Boolean(drafts && selected)
  const correctedBy = selected ? correctedByText(selected, appUsers) : ''

  function selectRow(r) {
    if (correcting) return
    setSelectedKey(r.key)
    setRejectReason('')
  }

  function startCorrect() {
    setNotice(null)
    setError(null)
    setDrafts(Object.fromEntries(selected.hourRows.map((h) => [h.id, draftFromHour(h)])))
  }

  function setDraft(id, key, value) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [key]: value } }))
  }

  async function saveCorrectionRows() {
    const problem = correctionError(selected.hourRows, drafts)
    if (problem) {
      setError(problem)
      return
    }
    const changes = correctionChanges(selected.hourRows, drafts)
    if (changes.length === 0) {
      setError('Nothing changed.')
      return
    }
    setCorrectSaving(true)
    setError(null)
    const { saved, failed } = await saveCorrection(changes, updateHourCorrection)
    setCorrectSaving(false)
    // Reload first: loadShift clears the error banner, so the result goes after it.
    await loadShift(logDate, shiftCode)
    if (failed) {
      setError(
        `Hour ${failed.hour_slot} was not saved: ${failed.message}` +
          (saved.length ? ` (hours ${saved.join(', ')} were saved -- the shift is now Pending and only you can continue).` : '')
      )
    } else {
      setDrafts(null)
      setNotice(`Corrected hours ${saved.join(', ')} -- the shift is Pending and needs another supervisor/admin to approve.`)
    }
  }

  // Live totals while correcting (saved values overlaid with the drafts).
  const gridHours = selected ? selected.hourRows.map((h) => (correcting ? { ...h, ...drafts[h.id] } : h)) : []
  const n = (v) => Number(v || 0)
  const totals = {
    produced: gridHours.reduce((s, h) => s + n(h.qty_produced), 0),
    rejected: gridHours.reduce((s, h) => s + n(h.qty_rejected), 0),
    rework: gridHours.reduce((s, h) => s + n(h.qty_rework), 0),
    accepted: gridHours.reduce((s, h) => s + acceptedFromHour(h), 0),
    idle: gridHours.reduce((s, h) => s + (totalIdle(h) || 0), 0),
  }

  async function decide(status) {
    if (!selected?.log_id) return
    if (status === 'Rejected' && !rejectReason.trim()) {
      setError('Enter a reason to reject.')
      return
    }
    setActing(true)
    setError(null)
    setNotice(null)
    try {
      await setShiftVerification({
        logId: selected.log_id,
        logDate: selected.log_date,
        shiftCode: selected.shift_code,
        status,
        rejectReason: rejectReason.trim(),
      })
      setRejectReason('')
      setNotice(`${status === 'Approved' ? 'Approved' : 'Rejected'}: ${selected.machine || selected.operation} · ${selected.prd_no}`)
      await loadShift(logDate, shiftCode)
    } catch (e) {
      setError(e.message)
    } finally {
      setActing(false)
    }
  }

  const exportRows = [
    ...shownMachineRows.map((r) => ({ ...r, section: 'Machine' })),
    ...shownManualRows.map((r) => ({ ...r, section: 'Manual', machine: r.operation })),
  ]
  const exportName = `shift_verification_${logDate}_${shiftCode}`

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader
        title={subItemLabel('production', 'shift-verification')}
        subtitle="Shift in-charge approves or rejects each machine's production entry for a shift"
      />
      <ActionToolbar
        showCrudButtons={false}
        showExport={ready}
        onExportExcel={() => exportToCsv(EXPORT_COLUMNS, exportRows, `${exportName}.csv`)}
        onExportPdf={() => exportToPdf(EXPORT_COLUMNS, exportRows, `Shift Verification – ${logDate} – Shift ${shiftCode}`, exportName)}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>}
        {notice && <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-2 rounded">{notice}</div>}

        <FormSection icon={CalendarCheck} title="1. Select Date & Shift" subtitle="Filters are optional" columns={3}>
          <Field label="Date" required>
            <TextInput type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
          </Field>
          <Field label="Shift" required>
            <SearchableSelect
              value={shiftCode}
              onChange={(e) => setShiftCode(e.target.value)}
              options={shifts.map((s) => s.shift_code)}
            />
          </Field>
          <Field label="Status">
            <SelectInput value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={SHIFT_STATUSES} />
          </Field>
          <Field label="Machine">
            <SearchableSelect
              value={machineFilter}
              onChange={(e) => setMachineFilter(e.target.value)}
              options={machines.map((m) => ({ value: m.machine_id, label: machineOptionLabel(m) }))}
            />
          </Field>
          <Field label="Employee">
            <EmployeeSelect employees={employees} value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} />
          </Field>
        </FormSection>

        {ready ? (
          <>
            <RecordsList
              title="Machines"
              columns={MACHINE_COLUMNS}
              rows={shownMachineRows}
              loading={loading}
              rowKey="key"
              selectedKey={selectedKey}
              onRowClick={selectRow}
              searchValue={searchMachines}
              onSearchChange={setSearchMachines}
              searchPlaceholder="Search machine / PRD / operator..."
            />
            <RecordsList
              title="Manual Operations"
              columns={MANUAL_COLUMNS}
              rows={shownManualRows}
              loading={loading}
              rowKey="key"
              selectedKey={selectedKey}
              onRowClick={selectRow}
              searchValue={searchManual}
              onSearchChange={setSearchManual}
              searchPlaceholder="Search operation / PRD / operator..."
            />
          </>
        ) : (
          <p className="text-sm text-gray-500 px-1">Pick a date and shift to see every machine for that shift.</p>
        )}

        {selected && (
          <FormSection
            icon={Clock3}
            title={`2. ${selected.machine || selected.operation || 'Manual'}${selected.prd_no ? ` · ${selected.prd_no}` : ''}`}
            subtitle={selected.stage || 'No production entered for this shift'}
          >
            <div className="w-full space-y-2">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <StatusPill status={selected.status} />
                {selected.status === 'Approved' && (
                  <span className="text-green-700">
                    Approved by {selected.decided_by} on {selected.decided_at}
                  </span>
                )}
                {selected.status === 'Rejected' && (
                  <span className="text-red-700">
                    Rejected: {selected.reject_reason} <span className="text-gray-500">({selected.decided_by}, {selected.decided_at})</span>
                  </span>
                )}
                {correctedBy && <span className="text-amber-700">{correctedBy}</span>}
                {substituteText && <span className="text-amber-800 font-medium" data-testid="substitute-line">{substituteText}</span>}
                {showCorrect && !correcting && (
                  <button
                    type="button"
                    onClick={startCorrect}
                    disabled={Boolean(correctBlock)}
                    title={correctBlock ?? undefined}
                    className="rounded bg-bmlhblue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                  >
                    Correct
                  </button>
                )}
                {showCorrect && correctBlock && <span className="text-xs text-amber-700">{correctBlock}</span>}
                {selected.log_id && selected.log_is_open && selected.status === 'Rejected' && (
                  <span className="text-xs text-gray-500">Log still open -- the operator corrects it in Production Data Entry / Manual Operations.</span>
                )}
              </div>

              {correcting && (
                <div className="bg-white border border-amber-300 rounded-md overflow-x-auto">
                  <p className="px-2 py-1.5 text-xs text-amber-800 bg-amber-50 border-b border-amber-200">
                    Correcting a closed log. Saved hours stamp you as the corrector; another supervisor or admin must then approve.
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 text-left">
                        <th className="px-2 py-1.5 font-medium">Hour</th>
                        <th className="px-2 py-1.5 font-medium">Produced</th>
                        <th className="px-2 py-1.5 font-medium">Rejected</th>
                        <th className="px-2 py-1.5 font-medium">Rework</th>
                        <th className="px-2 py-1.5 font-medium">Accepted</th>
                        {IDLE_CATEGORIES.map((c) => (
                          <th key={c.key} className="px-2 py-1.5 font-medium">{c.label}</th>
                        ))}
                        <th className="px-2 py-1.5 font-medium">Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gridHours.map((h) => (
                        <tr key={h.id} className="border-t border-gray-100 text-gray-700">
                          <td className="px-2 py-1">{h.hour_slot}</td>
                          {['qty_produced', 'qty_rejected', 'qty_rework'].map((k) => (
                            <td key={k} className="px-1 py-1">
                              <input type="number" min="0" aria-label={`Hour ${h.hour_slot} ${k}`} value={drafts[h.id][k]} onChange={(e) => setDraft(h.id, k, e.target.value)} className="w-16 rounded border border-gray-300 px-1 py-0.5" />
                            </td>
                          ))}
                          <td className="px-2 py-1 num-highlight">{acceptedFromHour(h)}</td>
                          {IDLE_CATEGORIES.map((c) => (
                            <td key={c.key} className="px-1 py-1">
                              <input type="number" min="0" aria-label={`Hour ${h.hour_slot} ${c.label}`} value={drafts[h.id][c.key]} onChange={(e) => setDraft(h.id, c.key, e.target.value)} className="w-12 rounded border border-gray-300 px-1 py-0.5" />
                            </td>
                          ))}
                          <td className="px-1 py-1">
                            <input value={drafts[h.id].remarks ?? ''} onChange={(e) => setDraft(h.id, 'remarks', e.target.value)} className="w-32 rounded border border-gray-300 px-1 py-0.5" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50 font-medium text-gray-700">
                        <td className="px-2 py-1">Total</td>
                        <td className="px-2 py-1 num-highlight">{totals.produced}</td>
                        <td className="px-2 py-1 num-highlight">{totals.rejected}</td>
                        <td className="px-2 py-1 num-highlight">{totals.rework}</td>
                        <td className="px-2 py-1 num-highlight">{totals.accepted}</td>
                        <td className="px-2 py-1" colSpan={IDLE_CATEGORIES.length}>Idle {totals.idle} min</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                  <div className="flex gap-2 p-2">
                    <button type="button" onClick={saveCorrectionRows} disabled={correctSaving} className="rounded bg-bmlhblue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
                      {correctSaving ? 'Saving...' : 'Save Correction'}
                    </button>
                    <button type="button" onClick={() => { setDrafts(null); setError(null) }} disabled={correctSaving} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {!correcting && selected.hourRows.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-md overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 text-left">
                        <th className="px-2 py-1.5 font-medium">Hour</th>
                        <th className="px-2 py-1.5 font-medium">Operator</th>
                        <th className="px-2 py-1.5 font-medium">Produced</th>
                        <th className="px-2 py-1.5 font-medium">Rejected</th>
                        <th className="px-2 py-1.5 font-medium">Rework</th>
                        <th className="px-2 py-1.5 font-medium">Accepted</th>
                        <th className="px-2 py-1.5 font-medium">Idle (min)</th>
                        <th className="px-2 py-1.5 font-medium">Remarks</th>
                        <th className="px-2 py-1.5 font-medium">Edited</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.hourRows.map((h) => (
                        <tr key={h.id} className="border-t border-gray-100 text-gray-700">
                          <td className="px-2 py-1">{h.hour_slot}</td>
                          <td className="px-2 py-1">{employeeLabelForId(h.employee_id, employees)}</td>
                          <td className="px-2 py-1 num-highlight">{h.qty_produced}</td>
                          <td className="px-2 py-1 num-highlight">{h.qty_rejected}</td>
                          <td className="px-2 py-1 num-highlight">{h.qty_rework}</td>
                          <td className="px-2 py-1 num-highlight">{acceptedFromHour(h)}</td>
                          <td className="px-2 py-1">{totalIdle(h) || 0}</td>
                          <td className="px-2 py-1">{h.remarks ?? ''}</td>
                          <td className="px-2 py-1">
                            {h.edited_at && (
                              <span title={editedHourTitle(h, appUsers)} className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                Edited
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50 font-medium text-gray-700">
                        <td className="px-2 py-1" colSpan={2}>Total ({selected.hours_entered} h)</td>
                        <td className="px-2 py-1 num-highlight">{selected.produced}</td>
                        <td className="px-2 py-1 num-highlight">{selected.rejected}</td>
                        <td className="px-2 py-1 num-highlight">{selected.rework}</td>
                        <td className="px-2 py-1 num-highlight">{selected.accepted}</td>
                        <td className="px-2 py-1">{selected.idle_min}</td>
                        <td />
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {selected.log_id && selected.status !== 'Approved' && !correcting && (
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Reject Reason" width="long">
                    <TextInput value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                  </Field>
                  <button
                    onClick={() => decide('Approved')}
                    disabled={acting || Boolean(blockedReason)}
                    title={blockedReason ?? undefined}
                    className="bg-green-600 text-white rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-green-700"
                  >
                    {acting ? 'Saving...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => decide('Rejected')}
                    disabled={acting || !rejectReason.trim()}
                    className="bg-red-600 text-white rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-red-700"
                  >
                    Reject
                  </button>
                  {blockedReason && <span className="text-xs text-amber-700">{blockedReason}</span>}
                </div>
              )}
            </div>
          </FormSection>
        )}
      </div>
    </div>
  )
}
