import { computeQualityResult } from '../../utils/qualityResult'
import { useEffect, useState } from 'react'
import { ClipboardCheck, Pencil } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import FormSection, { Field, SelectInput, AutoFillBox } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import usePartForPrd from '../../utils/usePartForPrd'
import RecordsList from '../../components/RecordsList'
import { machineOptionLabel } from '../../utils/machineLabel'
import StatusPill from '../../components/StatusPill'
import EmployeeSelect from '../../components/EmployeeSelect'
import { listEmployees } from '../../data/queries/employees'
import { listShifts } from '../../data/queries/shifts'
import { listMachines } from '../../data/queries/machines'
import {
  listPrdsWithRouteCard,
  createQualityLog,
  createQualityLogReadings,
  listQualityInspectionHistory,
  updateQualityLog,
  updateQualityLogReading,
} from '../../data/queries/qualityLogs'
import { canEditStock } from '../../utils/stockEdit'
import { useAppUsers, withEditedLabels, EDITED_COLUMN } from '../../components/StockEditPanel'
import { employeeLabelForId } from '../../utils/employeeLabel'
import { listQualityParameters } from '../../data/queries/qualityParameters'
import { getStagesForPrd } from '../../data/queries/routeCards'
import { machinesForStage, qualityParamsForMachine } from '../../utils/machineEligibility'
import { MACHINE_CHOICE_MODE } from '../../utils/constants'
import { listAllMachineOperations } from '../../data/queries/machineOperations'
import { supabase } from '../../lib/supabaseClient'

const EMPTY_HEADER = { employee_id: '', shift_code: '', prd_no: '', machine_id: '', operation: '' }

const HISTORY_COLUMNS = [
  { key: 'log_date', label: 'Date' },
  { key: 'prd_no', label: 'PRD' },
  { key: 'machine_id', label: 'Machine' },
  { key: 'operation', label: 'Operation' },
  { key: 'inspected_by', label: 'Inspected By' },
  { key: 'quality_parameter', label: 'Parameter' },
  { key: 'observed_value', label: 'Observed Value' },
  { key: 'result', label: 'Result', type: 'status' },
]

/**
 * Quality result is computed live from quality master tolerances (view:
 * "quality log results"). Whether a result should be frozen at inspection
 * time is pending BMLH's answer.
 * computeQualityResult (utils/qualityResult.js) mirrors that view's CASE
 * so what the user sees while typing matches what is derived after save.
 */
export default function QualityInspectionScreen({ role }) {
  const [step, setStep] = useState('header')

  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [machines, setMachines] = useState([])
  const [orders, setOrders] = useState([])
  const [history, setHistory] = useState([])
  const [historySearch, setHistorySearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [header, setHeader] = useState(EMPTY_HEADER)
  const [prdStages, setPrdStages] = useState([]) // Internal stages for the chosen PRD
  const [paramNote, setParamNote] = useState('') // "parameters from planned machine …"
  const [eligibleStages, setEligibleStages] = useState([]) // this PRD's stages the chosen machine can actually run, per Cycle Time Master
  const [resolvedStage, setResolvedStage] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [readingRows, setReadingRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // Supervisor/admin edit of a saved inspection (032): a history row picks
  // its inspection; Edit opens every reading of it.
  const appUsers = useAppUsers()
  const [selectedRow, setSelectedRow] = useState(null)
  const [editingLogId, setEditingLogId] = useState(null)

  async function refreshLookups() {
    setLoading(true)
    setError(null)
    try {
      const [employeeRows, shf, machs, ords, hist] = await Promise.all([
        listEmployees(),
        listShifts(),
        listMachines(),
        listPrdsWithRouteCard(),
        listQualityInspectionHistory(),
      ])
      setEmployees(employeeRows)
      setShifts(shf)
      setMachines(machs)
      setOrders(ords)
      setHistory(hist)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshLookups()
  }, [])

  const selectedOrder = orders.find((o) => o.prd_no === header.prd_no)
  const part = usePartForPrd(header.prd_no)

  async function handlePrdChange(e) {
    const prd = e.target.value
    setHeader((f) => ({ ...f, prd_no: prd, operation: '' }))
    setResolvedStage(null)
    if (!prd) {
      setPrdStages([])
      return
    }
    try {
      const stages = await getStagesForPrd(prd)
      setPrdStages(stages.filter((s) => s.type === 'Internal'))
    } catch (e) {
      setError(e.message)
    }
  }

  // Eligibility comes from Cycle Time Master (part_serial_number + seq +
  // machine_id) -- the route itself says which machines can run which
  // stage. "machine operations" is Machine Master's own informational
  // operation list and is never used to decide this (see
  // utils/machineEligibility.js); text-matching it against HPV2-style
  // operation names like "Rough Turning ONE" would never match BMLH's
  // generic "machine operations" names like "Rough Turning" at all.
  async function handleMachineChange(e) {
    const machineId = e.target.value
    setHeader((f) => ({ ...f, machine_id: machineId, operation: '' }))
    setResolvedStage(null)
    if (!machineId) {
      setEligibleStages([])
      return
    }
    const partSerialNumber = selectedOrder?.part_serial_number
    if (!partSerialNumber) {
      // Guard: never send an undefined filter -- no resolvable product
      // code means no eligible stages, not "show everything".
      setEligibleStages([])
      setError("Could not resolve this PRD's part serial number.")
      return
    }
    try {
      const [{ data, error }, machineOps] = await Promise.all([
        supabase.from('cycle time master').select('machine_id, seq, part_serial_number').eq('part_serial_number', partSerialNumber),
        listAllMachineOperations(),
      ])
      if (error) throw error
      // Same rule as Production Data Entry: planned machine + substitutes (MACHINE_CHOICE_MODE).
      setEligibleStages(
        prdStages.filter((st) =>
          machinesForStage({ mode: MACHINE_CHOICE_MODE, stage: st, machineOps, machines, cycleTimeRows: data }).some((m) => m.machine_id === machineId)
        )
      )
    } catch (e) {
      setError(e.message)
    }
  }

  function handleOperationChange(e) {
    const operation = e.target.value
    setHeader((f) => ({ ...f, operation }))
    const stage = prdStages.find((s) => s.operation === operation)
    setResolvedStage(stage ?? null)
  }

  // Before a machine is chosen, every stage on the route is a valid choice
  // (nothing to narrow by yet). Once a machine IS chosen, only stages this
  // machine actually has a Cycle Time Master row for are offered -- no
  // "show everything" fallback: if the machine has no rows for this
  // product, the list is deliberately empty (see noEligibleForMachine
  // below) rather than silently offering stages it can't run.
  const machineChosen = !!header.machine_id
  const operationOptions = machineChosen ? eligibleStages.map((s) => s.operation) : prdStages.map((s) => s.operation)
  const noEligibleForMachine = machineChosen && prdStages.length > 0 && eligibleStages.length === 0

  function resetHeader() {
    setHeader(EMPTY_HEADER)
    setPrdStages([])
    setEligibleStages([])
    setResolvedStage(null)
    setError(null)
  }

  async function handleSubmitHeader() {
    setError(null)
    if (!header.employee_id || !header.shift_code || !header.prd_no || !header.machine_id || !header.operation || !resolvedStage) {
      setError('Employee, Shift, Production Order, Machine and Type of Operation are all required.')
      return
    }
    setSubmitting(true)
    try {
      const params = await listQualityParameters()
      // Chosen machine's parameters, else the planned machine's (substitute machine).
      const { params: matching, note } = qualityParamsForMachine({
        params,
        partSerialNumber: selectedOrder?.part_serial_number,
        operation: header.operation,
        chosenId: header.machine_id,
        plannedId: resolvedStage.machine_id,
      })
      setParamNote(note)
      setReadingRows(
        matching.map((p) => ({
          quality_parameter_id: p.id,
          quality_parameter: p.quality_parameter,
          standard: p.standard,
          upper_tolerance: p.upper_tolerance,
          lower_tolerance: p.lower_tolerance,
          observed_value: '',
        }))
      )
      setSaveError(null)
      setStep('readings')
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleObservedChange(paramId, value) {
    setReadingRows((rows) => rows.map((r) => (r.quality_parameter_id === paramId ? { ...r, observed_value: value } : r)))
  }

  function handleBackToHeader() {
    setStep('header')
    setSaveError(null)
  }

  async function handleSaveReadings() {
    setSaveError(null)
    const filled = readingRows.filter((r) => r.observed_value !== '')
    if (filled.length === 0) {
      setSaveError('Enter at least one Observed Value before saving.')
      return
    }
    setSaving(true)
    try {
      const log = await createQualityLog({
        prd_no: header.prd_no,
        stage_id: resolvedStage.id,
        machine_id: header.machine_id,
        employee_id: header.employee_id,
        shift_code: header.shift_code,
      })
      await createQualityLogReadings(
        filled.map((r) => ({
          quality_log_id: log.id,
          quality_parameter_id: r.quality_parameter_id,
          observed_value: Number(r.observed_value),
        }))
      )
      resetHeader()
      setReadingRows([])
      setStep('header')
      await refreshLookups()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // New / Clear: back to an empty header (Employee and Shift are kept).
  function handleClear() {
    setEditingLogId(null)
    setSelectedRow(null)
    const { employee_id, shift_code } = header
    resetHeader()
    setHeader({ ...EMPTY_HEADER, employee_id, shift_code })
    setReadingRows([])
    setSaveError(null)
    setStep('header')
  }

  const historyRows = withEditedLabels(history, appUsers).map((r) => ({
    ...r,
    inspected_by: employeeLabelForId(r.employee_id, employees),
  }))
  const editingRows = editingLogId ? history.filter((r) => r.quality_log_id === editingLogId) : []

  async function handleSaveEdit({ employee_id, shift_code, values }) {
    const first = editingRows[0]
    if (!employee_id || !shift_code) return 'Employee and Shift are required.'
    for (const r of editingRows) {
      const v = values[r.reading_id]
      if (v === '' || v === undefined || !Number.isFinite(Number(v))) return `Enter a number for ${r.quality_parameter}.`
    }
    if (employee_id !== first.employee_id || shift_code !== first.shift_code) {
      await updateQualityLog(editingLogId, { employee_id, shift_code })
    }
    for (const r of editingRows) {
      const v = Number(values[r.reading_id])
      if (v !== Number(r.observed_value)) await updateQualityLogReading(r.reading_id, { observed_value: v })
    }
    setEditingLogId(null)
    setSelectedRow(null)
    await refreshLookups()
    return null
  }

  const filteredHistory = historyRows.filter((r) => {
    if (!historySearch) return true
    const q = historySearch.toLowerCase()
    return (
      r.prd_no?.toLowerCase().includes(q) ||
      r.machine_id?.toLowerCase().includes(q) ||
      r.quality_parameter?.toLowerCase().includes(q) ||
      r.operation?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Quality Inspection" subtitle="Define Quality Parameters  |  Maintain Standards  |  Ensure Product Excellence" />
      {/* Save = Submit on the header step, Save Inspection on the readings
          step. Edit (supervisor/admin, 032) corrects a saved inspection; no Delete. */}
      <ActionToolbar
        showEditDelete={canEditStock(role)}
        showDelete={false}
        onEdit={() => setEditingLogId(selectedRow?.quality_log_id ?? null)}
        canEdit={!!selectedRow && !editingLogId}
        onNew={handleClear}
        onSave={step === 'header' ? handleSubmitHeader : handleSaveReadings}
        onClear={handleClear}
        canSave={step === 'header' || readingRows.length > 0}
        saving={submitting || saving}
        saveLabel={step === 'header' ? 'Submit' : 'Save Inspection'}
        onExportExcel={() => exportToCsv(HISTORY_COLUMNS, filteredHistory, 'quality_inspections.csv')}
        onExportPdf={() => exportToPdf(HISTORY_COLUMNS, filteredHistory, 'Quality Inspection History', 'quality_inspections')}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>
        )}

        {step === 'header' && (
          <FormSection icon={ClipboardCheck} title="1. Inspection Header" subtitle="Who, what and where inspected" columns={3}>
            <Field label="Employee" required>
              <EmployeeSelect
                employees={employees}
                value={header.employee_id}
                onChange={(e) => setHeader((f) => ({ ...f, employee_id: e.target.value }))}
              />
            </Field>
            <Field label="Shift" required>
              <SelectInput
                value={header.shift_code}
                onChange={(e) => setHeader((f) => ({ ...f, shift_code: e.target.value }))}
                options={shifts.map((s) => ({ value: s.shift_code, label: s.shift_name }))}
              />
            </Field>
            <Field label="Date & Time">
              <AutoFillBox value={new Date().toLocaleString()} />
            </Field>
            <Field label="Production Order (PRD No)" required>
              <SearchableSelect value={header.prd_no} onChange={handlePrdChange} options={orders.map((o) => o.prd_no)} />
            </Field>
            <Field label="Part Serial Number">
              <AutoFillBox value={selectedOrder?.part_serial_number ?? ''} />
            </Field>
            <Field label="Part Name">
              <AutoFillBox value={part.part_name} />
            </Field>
            <Field label="Part Drawing Number">
              <AutoFillBox value={part.part_drawing_reference_number} />
            </Field>
            <Field label="Machine" required>
              <SearchableSelect
                value={header.machine_id}
                onChange={handleMachineChange}
                options={machines.map((m) => ({ value: m.machine_id, label: machineOptionLabel(m) }))}
              />
            </Field>
            <Field label="Type of Operation" required>
              <SearchableSelect
                value={header.operation}
                onChange={handleOperationChange}
                disabled={!header.prd_no}
                options={operationOptions}
              />
            </Field>
            <Field label="Cycle Time (min)">
              <AutoFillBox value={resolvedStage?.cycle_time_min ?? ''} />
            </Field>
            {noEligibleForMachine && (
              <p className="text-sm text-amber-600 sm:col-span-3">
                No stage of this product is set up for this machine in Cycle Time Master.
              </p>
            )}
          </FormSection>
        )}

        {step === 'readings' && (
          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="flex items-center justify-between gap-2 bg-bmlhsky border-b border-gray-200 px-3.5 py-1.5">
              <h2 className="text-xs font-semibold text-bmlhnavy">
                2. Readings -- {header.prd_no} / {header.machine_id} / {header.operation}
              </h2>
              <button onClick={handleBackToHeader} className="text-xs text-bmlhblue hover:underline">
                Back
              </button>
            </div>

            {saveError && (
              <div className="bg-red-50 border-b border-red-200 text-red-700 text-xs px-3.5 py-1.5">{saveError}</div>
            )}

            {paramNote && readingRows.length > 0 && (
              <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs px-3.5 py-1.5" data-testid="param-note">
                {paramNote}
              </div>
            )}
            {readingRows.length === 0 ? (
              <div className="p-4 text-xs text-gray-500">
                No quality parameters are defined for product "{selectedOrder?.part_serial_number}" on machine "
                {header.machine_id}". Add them in Quality Master before an inspection can be logged here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-bmlhnavy text-left">
                      <th className="px-3 py-1.5 font-semibold">Parameter</th>
                      <th className="px-3 py-1.5 font-semibold">Standard</th>
                      <th className="px-3 py-1.5 font-semibold">Upper Tol.</th>
                      <th className="px-3 py-1.5 font-semibold">Lower Tol.</th>
                      <th className="px-3 py-1.5 font-semibold">Observed Value</th>
                      <th className="px-3 py-1.5 font-semibold">Certification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readingRows.map((row) => {
                      const result = computeQualityResult(row.standard, row.upper_tolerance, row.lower_tolerance, row.observed_value)
                      const noLimit = row.standard === null || row.standard === undefined
                      return (
                        <tr key={row.quality_parameter_id} className="border-t border-gray-100">
                          <td className="px-3 py-1">{row.quality_parameter}</td>
                          <td className="px-3 py-1 text-gray-500">{row.standard ?? '—'}</td>
                          <td className="px-3 py-1 text-gray-500">{row.upper_tolerance ?? '—'}</td>
                          <td className="px-3 py-1 text-gray-500">{row.lower_tolerance ?? '—'}</td>
                          <td className="px-3 py-1">
                            <input
                              type="number"
                              value={row.observed_value}
                              onChange={(e) => handleObservedChange(row.quality_parameter_id, e.target.value)}
                              className="border border-gray-300 rounded px-2.5 py-1.5 text-xs w-28 focus:outline-none focus:ring-2 focus:ring-bmlhblue/30"
                            />
                          </td>
                          <td className="px-3 py-1">
                            {noLimit ? (
                              <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-500">
                                No limit set
                              </span>
                            ) : (
                              <StatusPill status={result} />
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {editingLogId && editingRows.length > 0 && (
          <InspectionEditPanel
            rows={editingRows}
            employees={employees}
            shifts={shifts}
            onSave={handleSaveEdit}
            onCancel={() => setEditingLogId(null)}
          />
        )}

        <RecordsList
          title="Quality Inspection History"
          columns={[...HISTORY_COLUMNS, EDITED_COLUMN]}
          rows={filteredHistory}
          loading={loading}
          error={null}
          rowKey="reading_id"
          selectedKey={selectedRow?.reading_id}
          onRowClick={(r) => !editingLogId && setSelectedRow(r)}
          searchValue={historySearch}
          onSearchChange={setHistorySearch}
          searchPlaceholder="Search by PRD / Machine / Parameter..."
        />
        <div className="text-xs text-gray-500 px-1">Total Records: {filteredHistory.length}</div>
      </div>
    </div>
  )
}

/** Supervisor/admin correction of one saved inspection: Employee, Shift and
 * every reading's Observed Value; PRD / machine / operation / date stay as
 * saved (the DB refuses changing them, 032). onSave returns an error or null. */
function InspectionEditPanel({ rows, employees, shifts, onSave, onCancel }) {
  const first = rows[0]
  const [employeeId, setEmployeeId] = useState(first.employee_id ?? '')
  const [shiftCode, setShiftCode] = useState(first.shift_code ?? '')
  const [values, setValues] = useState(() => Object.fromEntries(rows.map((r) => [r.reading_id, String(r.observed_value ?? '')])))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const message = await onSave({ employee_id: employeeId, shift_code: shiftCode, values })
      if (message) setError(message)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormSection icon={Pencil} title="Edit Inspection" subtitle="Supervisor / admin correction -- recorded with who and when" columns={3}>
      {error && <div className="sm:col-span-3 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>}
      <Field label="Production Order (PRD No)">
        <AutoFillBox value={first.prd_no} />
      </Field>
      <Field label="Machine">
        <AutoFillBox value={first.machine_id} />
      </Field>
      <Field label="Type of Operation">
        <AutoFillBox value={first.operation} />
      </Field>
      <Field label="Date">
        <AutoFillBox value={first.log_date} />
      </Field>
      <Field label="Employee" required>
        <EmployeeSelect employees={employees} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
      </Field>
      <Field label="Shift" required>
        <SelectInput value={shiftCode} onChange={(e) => setShiftCode(e.target.value)} options={shifts.map((s) => ({ value: s.shift_code, label: s.shift_name }))} />
      </Field>
      <div className="sm:col-span-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-bmlhnavy text-left">
              <th className="px-3 py-1.5 font-semibold">Parameter</th>
              <th className="px-3 py-1.5 font-semibold">Standard</th>
              <th className="px-3 py-1.5 font-semibold">Upper Tol.</th>
              <th className="px-3 py-1.5 font-semibold">Lower Tol.</th>
              <th className="px-3 py-1.5 font-semibold">Observed Value</th>
              <th className="px-3 py-1.5 font-semibold">Certification</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const noLimit = r.standard === null || r.standard === undefined
              return (
                <tr key={r.reading_id} className="border-t border-gray-100">
                  <td className="px-3 py-1">{r.quality_parameter}</td>
                  <td className="px-3 py-1 text-gray-500">{r.standard ?? '—'}</td>
                  <td className="px-3 py-1 text-gray-500">{r.upper_tolerance ?? '—'}</td>
                  <td className="px-3 py-1 text-gray-500">{r.lower_tolerance ?? '—'}</td>
                  <td className="px-3 py-1">
                    <input
                      type="number"
                      value={values[r.reading_id]}
                      onChange={(e) => setValues((v) => ({ ...v, [r.reading_id]: e.target.value }))}
                      className="border border-gray-300 rounded px-2.5 py-1.5 text-xs w-28 focus:outline-none focus:ring-2 focus:ring-bmlhblue/30"
                    />
                  </td>
                  <td className="px-3 py-1">
                    {noLimit ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-500">No limit set</span>
                    ) : (
                      <StatusPill status={computeQualityResult(r.standard, r.upper_tolerance, r.lower_tolerance, values[r.reading_id])} />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="sm:col-span-3 flex items-center gap-2 pt-1">
        <button type="button" onClick={handleSave} disabled={saving} className="rounded bg-bmlhblue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700">
          Cancel
        </button>
      </div>
    </FormSection>
  )
}
