import { useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, SelectInput, AutoFillBox } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import { machineOptionLabel } from '../../utils/machineLabel'
import StatusPill from '../../components/StatusPill'
import EmployeeSelect from '../../components/EmployeeSelect'
import { listEmployees } from '../../data/queries/employees'
import { listShifts } from '../../data/queries/shifts'
import { listMachines } from '../../data/queries/machines'
import { listPrdsWithRouteCard, createQualityLog, createQualityLogReadings, listQualityInspectionHistory } from '../../data/queries/qualityLogs'
import { listQualityParameters } from '../../data/queries/qualityParameters'
import { getStagesForPrd } from '../../data/queries/routeCards'
import { stagesEligibleForMachine } from '../../utils/machineEligibility'
import { supabase } from '../../lib/supabaseClient'

const EMPTY_HEADER = { employee_id: '', shift_code: '', prd_no: '', machine_id: '', operation: '' }

const HISTORY_COLUMNS = [
  { key: 'log_date', label: 'Date' },
  { key: 'prd_no', label: 'PRD' },
  { key: 'machine_id', label: 'Machine' },
  { key: 'operation', label: 'Operation' },
  { key: 'quality_parameter', label: 'Parameter' },
  { key: 'observed_value', label: 'Observed Value' },
  { key: 'result', label: 'Result', type: 'status' },
]

/**
 * Quality result is computed live from quality master tolerances (view:
 * "quality log results"). Whether a result should be frozen at inspection
 * time is pending BMLH's answer.
 *
 * This mirrors that view's CASE expression exactly so what the user sees
 * while typing matches what gets stored/derived after save.
 */
function computeResult(standard, upperTolerance, lowerTolerance, observedValue) {
  if (standard === null || standard === undefined || standard === '') return null
  const obs = Number(observedValue)
  if (observedValue === '' || Number.isNaN(obs)) return null
  const lower = standard - (lowerTolerance ?? 0)
  const upper = standard + (upperTolerance ?? 0)
  return obs >= lower && obs <= upper ? 'Accepted' : 'Not Accepted'
}

export default function QualityModule() {
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
  const [eligibleStages, setEligibleStages] = useState([]) // this PRD's stages the chosen machine can actually run, per Cycle Time Master
  const [resolvedStage, setResolvedStage] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [readingRows, setReadingRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

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
      const { data, error } = await supabase
        .from('cycle time master')
        .select('machine_id, seq, part_serial_number')
        .eq('part_serial_number', partSerialNumber)
      if (error) throw error
      setEligibleStages(stagesEligibleForMachine({ stages: prdStages, cycleTimeRows: data, partSerialNumber, machineId }))
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
      const matching = params.filter(
        (p) =>
          p.part_serial_number === selectedOrder?.part_serial_number &&
          p.machine_id === header.machine_id &&
          (!p.type_of_operation || p.type_of_operation === header.operation)
      )
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

  const filteredHistory = history.filter((r) => {
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
              <SelectInput value={header.prd_no} onChange={handlePrdChange} options={orders.map((o) => o.prd_no)} />
            </Field>
            <Field label="Part Serial Number">
              <AutoFillBox value={selectedOrder?.part_serial_number ?? ''} />
            </Field>
            <Field label="Machine" required>
              <SelectInput
                value={header.machine_id}
                onChange={handleMachineChange}
                options={machines.map((m) => ({ value: m.machine_id, label: machineOptionLabel(m) }))}
              />
            </Field>
            <Field label="Type of Operation" required>
              <SelectInput
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
            <div className="flex items-end">
              <button
                onClick={handleSubmitHeader}
                disabled={submitting}
                className="bg-bmlhblue text-white rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-[#163d70]"
              >
                {submitting ? 'Loading...' : 'Submit'}
              </button>
            </div>
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
                      const result = computeResult(row.standard, row.upper_tolerance, row.lower_tolerance, row.observed_value)
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
                <div className="p-3">
                  <button
                    onClick={handleSaveReadings}
                    disabled={saving}
                    className="bg-green-600 text-white rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-green-700"
                  >
                    {saving ? 'Saving...' : 'Save Inspection'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <RecordsList
          title="Quality Inspection History"
          columns={HISTORY_COLUMNS}
          rows={filteredHistory}
          loading={loading}
          error={null}
          rowKey="reading_id"
          searchValue={historySearch}
          onSearchChange={setHistorySearch}
          searchPlaceholder="Search by PRD / Machine / Parameter..."
        />
        <div className="text-xs text-gray-500 px-1">Total Records: {filteredHistory.length}</div>
      </div>
    </div>
  )
}
