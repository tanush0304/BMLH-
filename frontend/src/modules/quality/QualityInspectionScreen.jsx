import { computeQualityResult, isGaugeRow, gaugeResultLabel, readingValueText, readingResultText, standardText } from '../../utils/qualityResult'
import GaugeButtons from '../../components/GaugeButtons'
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
import { machinesForStage } from '../../utils/machineEligibility'
import { qualityParamsForStage, noParamsMessage, machineCategoryOf, jobWorkParamsForStage, noJobWorkParamsMessage } from '../../utils/qualityMatch'
import { qualityReceiptSupported, listReceiptsForPrd, getReceiptWithDc } from '../../data/queries/jobworkQc'
import { receiptFromMode, qualityMachineText } from '../../utils/jobworkQc'
import { ddmmyyyy } from '../../utils/alerts'
import PendingIncomingQcPanel from './PendingIncomingQcPanel'
import { stageLabel } from '../../utils/stageLabel'
import { MACHINE_CHOICE_MODE } from '../../utils/constants'
import { listAllMachineOperations } from '../../data/queries/machineOperations'
import { supabase } from '../../lib/supabaseClient'
import Banner from '../../components/Banner'
import OrderLineFields from '../../components/OrderLineFields'

// stage_id picks the stage (two stages may share an operation name); operation
// is that stage's operation text, used for parameter matching and display.
// receipt_id (054): an incoming inspection of a jobwork receipt -- no machine.
const EMPTY_HEADER = { employee_id: '', shift_code: '', prd_no: '', machine_id: '', stage_id: '', operation: '', receipt_id: '' }

/** "JR-008 · DC-008 · Stage 4 – Toughening · 411 pcs · 15-11-2026" */
export function receiptOptionLabel(r, stages = []) {
  const stage = stages.find((s) => String(s.id) === String(r.stage_id))
  return [r.receipt_no, r.dc_no, stage ? stageLabel(stage) : null, `${r.qty_received} pcs`, ddmmyyyy(r.receipt_date)].filter(Boolean).join(' · ')
}

/** One readings-table row from a Quality Master parameter. */
function readingRowFromParam(p) {
  return {
    quality_parameter_id: p.id,
    quality_parameter: p.quality_parameter,
    standard: p.standard,
    upper_tolerance: p.upper_tolerance,
    lower_tolerance: p.lower_tolerance,
    observed_value: '',
    check_type: p.check_type ?? 'Measured', // 048
    job_work_code: p.job_work_code ?? null, // 054: Job Work = always OK / Not OK
    gauge_ref: p.gauge_ref ?? '',
    gauge_standard: p.gauge_standard ?? null, // 053
    gauge_result: '',
  }
}

/** History "Machine": the machine id, or "Jobwork · JR-008" for a receipt inspection (054). */
export function historyMachineText(r) {
  const text = qualityMachineText(r)
  return !r?.machine_id && r?.receipt_no ? `${text} · ${r.receipt_no}` : text
}

const HISTORY_COLUMNS = [
  { key: 'log_date', label: 'Date' },
  { key: 'prd_no', label: 'PRD' },
  { key: 'machine_text', label: 'Machine' }, // receipt logs (054): "Jobwork · JR-008"
  { key: 'operation', label: 'Operation' },
  { key: 'inspected_by', label: 'Inspected By' },
  { key: 'quality_parameter', label: 'Parameter' },
  { key: 'check_type_text', label: 'Check Type', needsCheckType: true },
  { key: 'instrument_text', label: 'Instrument', needsCheckType: true }, // gauge_ref
  { key: 'standard_text', label: 'Standard' }, // Measured number / Gauge text (053)
  { key: 'value_text', label: 'Observed Value' },
  { key: 'result_text', label: 'Result', type: 'status' },
]

/**
 * Quality result is computed live from quality master tolerances (view:
 * "quality log results"). Whether a result should be frozen at inspection
 * time is pending BMLH's answer.
 * computeQualityResult (utils/qualityResult.js) mirrors that view's CASE
 * so what the user sees while typing matches what is derived after save.
 */
export default function QualityInspectionScreen({ role, initialMode }) {
  const [step, setStep] = useState('header')
  // 054: "Inspection Of" machine stage | jobwork receipt (incoming QC)
  const [receiptOn, setReceiptOn] = useState(false)
  const [inspectionOf, setInspectionOf] = useState('machine')
  const [allStages, setAllStages] = useState([]) // every stage of the PRD (receipt mode needs the outsourced ones)
  const [prdReceipts, setPrdReceipts] = useState([])
  const [panelKey, setPanelKey] = useState(0)
  const byReceipt = receiptOn && inspectionOf === 'receipt'

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

  useEffect(() => {
    let live = true
    qualityReceiptSupported().then((ok) => live && setReceiptOn(!!ok)).catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const selectedOrder = orders.find((o) => o.prd_no === header.prd_no)
  const part = usePartForPrd(header.prd_no)

  async function loadPrd(prd) {
    const stages = await getStagesForPrd(prd)
    setAllStages(stages)
    setPrdStages(stages.filter((s) => s.type === 'Internal'))
    setPrdReceipts(receiptOn || (await qualityReceiptSupported()) ? await listReceiptsForPrd(prd) : [])
    return stages
  }

  async function handlePrdChange(e) {
    const prd = e.target.value
    setHeader((f) => ({ ...f, prd_no: prd, stage_id: '', operation: '', receipt_id: '' }))
    setResolvedStage(null)
    if (!prd) {
      setPrdStages([])
      setAllStages([])
      setPrdReceipts([])
      return
    }
    try {
      await loadPrd(prd)
    } catch (e) {
      setError(e.message)
    }
  }

  function pickReceipt(receiptId, receipts = prdReceipts, stages = allStages) {
    const r = receipts.find((x) => String(x.id) === String(receiptId)) ?? null
    const stage = r ? stages.find((s) => String(s.id) === String(r.stage_id)) ?? null : null
    setHeader((f) => ({ ...f, receipt_id: r ? String(r.id) : '', machine_id: '', stage_id: stage ? String(stage.id) : '', operation: stage?.operation ?? '' }))
    setResolvedStage(stage)
  }

  function handleInspectionOf(value) {
    setInspectionOf(value)
    setHeader((f) => ({ ...f, machine_id: '', stage_id: '', operation: '', receipt_id: '' }))
    setResolvedStage(null)
    setEligibleStages([])
  }

  // Pending panel "Inspect" / bell Open (qc:<receipt id>): receipt mode with that receipt.
  async function startReceiptInspection(receiptId) {
    try {
      const r = await getReceiptWithDc(receiptId)
      if (!r) return
      setInspectionOf('receipt')
      setStep('header')
      setHeader((f) => ({ ...f, prd_no: r.prd_no, machine_id: '', stage_id: '', operation: '', receipt_id: '' }))
      const stages = await getStagesForPrd(r.prd_no)
      setAllStages(stages)
      setPrdStages(stages.filter((s) => s.type === 'Internal'))
      const receipts = await listReceiptsForPrd(r.prd_no)
      setPrdReceipts(receipts)
      pickReceipt(receiptId, receipts, stages)
    } catch (e) {
      setError(e.message)
    }
  }

  const initialReceipt = receiptFromMode(initialMode)
  useEffect(() => {
    if (initialReceipt != null && receiptOn) startReceiptInspection(initialReceipt)
  }, [initialReceipt, receiptOn]) // once per opened receipt

  // Eligibility comes from Cycle Time Master (part_serial_number + seq +
  // machine_id) -- the route itself says which machines can run which
  // stage. "machine operations" is Machine Master's own informational
  // operation list and is never used to decide this (see
  // utils/machineEligibility.js); text-matching it against HPV2-style
  // operation names like "Rough Turning ONE" would never match BMLH's
  // generic "machine operations" names like "Rough Turning" at all.
  async function handleMachineChange(e) {
    const machineId = e.target.value
    setHeader((f) => ({ ...f, machine_id: machineId, stage_id: '', operation: '' }))
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
    const stageId = e.target.value
    const stage = prdStages.find((s) => String(s.id) === String(stageId)) ?? null
    setHeader((f) => ({ ...f, stage_id: stage ? String(stage.id) : '', operation: stage?.operation ?? '' }))
    setResolvedStage(stage)
  }

  // Before a machine is chosen, every stage on the route is a valid choice
  // (nothing to narrow by yet). Once a machine IS chosen, only stages this
  // machine actually has a Cycle Time Master row for are offered -- no
  // "show everything" fallback: if the machine has no rows for this
  // product, the list is deliberately empty (see noEligibleForMachine
  // below) rather than silently offering stages it can't run.
  const machineChosen = !!header.machine_id
  const operationOptions = (machineChosen ? eligibleStages : prdStages).map((s) => ({ value: String(s.id), label: stageLabel(s) }))
  const noEligibleForMachine = machineChosen && prdStages.length > 0 && eligibleStages.length === 0

  function resetHeader() {
    setHeader(EMPTY_HEADER)
    setPrdStages([])
    setAllStages([])
    setPrdReceipts([])
    setEligibleStages([])
    setResolvedStage(null)
    setError(null)
  }

  async function handleSubmitHeader() {
    setError(null)
    if (byReceipt) {
      if (!header.employee_id || !header.shift_code || !header.prd_no || !header.receipt_id || !resolvedStage) {
        setError('Employee, Shift, Production Order and Jobwork Receipt are all required.')
        return
      }
      setSubmitting(true)
      try {
        const params = await listQualityParameters()
        const matching = jobWorkParamsForStage({
          params,
          partSerialNumber: selectedOrder?.part_serial_number,
          operation: header.operation,
          jobWorkCode: resolvedStage.job_work_code,
        })
        setParamNote('')
        setReadingRows(matching.map(readingRowFromParam))
        setSaveError(null)
        setStep('readings')
      } catch (e) {
        setError(e.message)
      } finally {
        setSubmitting(false)
      }
      return
    }
    if (!header.employee_id || !header.shift_code || !header.prd_no || !header.machine_id || !header.operation || !resolvedStage) {
      setError('Employee, Shift, Production Order, Machine and Type of Operation are all required.')
      return
    }
    setSubmitting(true)
    try {
      const params = await listQualityParameters()
      // Chosen machine's parameters, else the planned machine's (substitute machine).
      // Exact machine + its category (exact wins per parameter name), else the planned machine's.
      const { params: matching, note } = qualityParamsForStage({
        params,
        machines,
        partSerialNumber: selectedOrder?.part_serial_number,
        operation: header.operation,
        chosenId: header.machine_id,
        plannedId: resolvedStage.machine_id,
      })
      setParamNote(note)
      setReadingRows(matching.map(readingRowFromParam))
      setSaveError(null)
      setStep('readings')
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleGaugeChange(paramId, value) {
    setReadingRows((rows) => rows.map((r) => (r.quality_parameter_id === paramId ? { ...r, gauge_result: value } : r)))
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
    // 048: every Gauge check needs OK / Not OK; Measured rows as before
    const unansweredGauge = readingRows.find((r) => isGaugeRow(r) && !r.gauge_result)
    if (unansweredGauge) {
      setSaveError(`Choose OK or Not OK for ${unansweredGauge.quality_parameter}.`)
      return
    }
    const filled = readingRows.filter((r) => (isGaugeRow(r) ? !!r.gauge_result : r.observed_value !== ''))
    if (filled.length === 0) {
      setSaveError('Enter at least one Observed Value before saving.')
      return
    }
    setSaving(true)
    try {
      const log = await createQualityLog({
        prd_no: header.prd_no,
        stage_id: resolvedStage.id,
        // 054: a receipt inspection has no machine (DB check: machine OR receipt)
        machine_id: byReceipt ? null : header.machine_id,
        ...(byReceipt ? { receipt_id: Number(header.receipt_id) } : {}),
        employee_id: header.employee_id,
        shift_code: header.shift_code,
      })
      await createQualityLogReadings(
        filled.map((r) => ({
          quality_log_id: log.id,
          quality_parameter_id: r.quality_parameter_id,
          ...(isGaugeRow(r)
            ? { observed_value: null, gauge_result: r.gauge_result }
            : { observed_value: Number(r.observed_value) }),
        }))
      )
      resetHeader()
      setReadingRows([])
      setStep('header')
      setPanelKey((k) => k + 1)
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
    // 048: a Gauge reading shows OK / Not OK and Accepted / Rejected
    standard_text: standardText(r) ?? '',
    value_text: readingValueText(r),
    result_text: readingResultText(r),
    check_type_text: isGaugeRow(r) ? 'Gauge' : 'Measured',
    instrument_text: r.gauge_ref || '',
    machine_text: historyMachineText(r),
  }))
  // 048: the view only has check_type once 048 is run
  const historyColumns = HISTORY_COLUMNS.filter((c) => !c.needsCheckType || history.some((r) => 'check_type' in r))
  const editingRows = editingLogId ? history.filter((r) => r.quality_log_id === editingLogId) : []

  async function handleSaveEdit({ employee_id, shift_code, values }) {
    const first = editingRows[0]
    if (!employee_id || !shift_code) return 'Employee and Shift are required.'
    for (const r of editingRows) {
      const v = values[r.reading_id]
      if (isGaugeRow(r)) {
        if (v !== 'OK' && v !== 'Not OK') return `Choose OK or Not OK for ${r.quality_parameter}.`
        continue
      }
      if (v === '' || v === undefined || !Number.isFinite(Number(v))) return `Enter a number for ${r.quality_parameter}.`
    }
    if (employee_id !== first.employee_id || shift_code !== first.shift_code) {
      await updateQualityLog(editingLogId, { employee_id, shift_code })
    }
    for (const r of editingRows) {
      if (isGaugeRow(r)) {
        if (values[r.reading_id] !== r.gauge_result) await updateQualityLogReading(r.reading_id, { gauge_result: values[r.reading_id] })
        continue
      }
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
      r.machine_text?.toLowerCase().includes(q) ||
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
        onExportExcel={() => exportToCsv(historyColumns, filteredHistory, 'quality_inspections.csv')}
        onExportPdf={() => exportToPdf(historyColumns, filteredHistory, 'Quality Inspection History', 'quality_inspections')}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <Banner tone="error" message={error} />
        )}

        <PendingIncomingQcPanel refreshKey={panelKey} onInspect={(item) => startReceiptInspection(item.receipt_id)} />

        {step === 'header' && (
          <FormSection icon={ClipboardCheck} title="1. Inspection Header" subtitle="Who, what and where inspected" columns={3}>
            {receiptOn && (
              <Field label="Inspection Of" required>
                <div className="flex items-center gap-4 h-8 text-xs" role="radiogroup" aria-label="Inspection Of">
                  {[['machine', 'Machine stage'], ['receipt', 'Jobwork receipt (incoming)']].map(([value, label]) => (
                    <label key={value} className="inline-flex items-center gap-1.5">
                      <input type="radio" name="qi-inspection-of" value={value} checked={inspectionOf === value} onChange={() => handleInspectionOf(value)} />
                      {label}
                    </label>
                  ))}
                </div>
              </Field>
            )}
            <Field label="Date & Time">
              <AutoFillBox value={new Date().toLocaleString()} />
            </Field>
            <Field label="Shift" required>
              <SelectInput
                value={header.shift_code}
                onChange={(e) => setHeader((f) => ({ ...f, shift_code: e.target.value }))}
                options={shifts.map((s) => ({ value: s.shift_code, label: s.shift_name }))}
              />
            </Field>
            <Field label="Employee ID" required>
              <EmployeeSelect
                employees={employees}
                value={header.employee_id}
                onChange={(e) => setHeader((f) => ({ ...f, employee_id: e.target.value }))}
              />
            </Field>
            <Field label="PRD No" required>
              <SearchableSelect value={header.prd_no} onChange={handlePrdChange} options={orders.map((o) => o.prd_no)} />
            </Field>
            <Field label="Part Serial No">
              <AutoFillBox value={selectedOrder?.part_serial_number ?? ''} />
            </Field>
            <Field label="Part Name">
              <AutoFillBox value={part.part_name} />
            </Field>
            <OrderLineFields part={part} />
            <Field label="Part Drawing No">
              <AutoFillBox value={part.part_drawing_reference_number} />
            </Field>
            {byReceipt ? (
              <>
                <Field label="Jobwork Receipt" required>
                  <SearchableSelect
                    value={header.receipt_id}
                    onChange={(e) => pickReceipt(e.target.value)}
                    disabled={!header.prd_no}
                    options={prdReceipts.map((r) => ({ value: String(r.id), label: receiptOptionLabel(r, allStages) }))}
                  />
                </Field>
                <Field label="Stage">
                  <AutoFillBox value={resolvedStage ? stageLabel(resolvedStage) : ''} />
                </Field>
                {header.prd_no && prdReceipts.length === 0 && (
                  <p className="text-sm text-amber-600 sm:col-span-3">Nothing has come back from jobwork on this PRD yet.</p>
                )}
              </>
            ) : (
              <>
                <Field label="Machine" required>
                  <SearchableSelect
                    value={header.machine_id}
                    onChange={handleMachineChange}
                    options={machines.map((m) => ({ value: m.machine_id, label: machineOptionLabel(m) }))}
                  />
                </Field>
                <Field label="Type of Operation" required>
                  <SearchableSelect
                    value={header.stage_id}
                    onChange={handleOperationChange}
                    disabled={!header.prd_no}
                    options={operationOptions}
                  />
                </Field>
              </>
            )}
            {!byReceipt && noEligibleForMachine && (
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
                2. Readings -- {header.prd_no} / {byReceipt ? `Jobwork · ${prdReceipts.find((r) => String(r.id) === String(header.receipt_id))?.receipt_no ?? ''}` : header.machine_id} / {header.operation}
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
                {byReceipt
                  ? noJobWorkParamsMessage({
                    partSerialNumber: selectedOrder?.part_serial_number,
                    operation: header.operation,
                    jobWorkCode: resolvedStage?.job_work_code,
                  })
                  : noParamsMessage({
                    partSerialNumber: selectedOrder?.part_serial_number,
                    operation: header.operation,
                    machineId: header.machine_id,
                    category: machineCategoryOf(machines, header.machine_id),
                  })}
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
                      <th className="px-3 py-1.5 font-semibold">Instrument</th>
                      <th className="px-3 py-1.5 font-semibold">Observed Value</th>
                      <th className="px-3 py-1.5 font-semibold">Certification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readingRows.map((row) => {
                      const gauge = isGaugeRow(row)
                      const result = gauge
                        ? gaugeResultLabel(row.gauge_result)
                        : computeQualityResult(row.standard, row.upper_tolerance, row.lower_tolerance, row.observed_value)
                      const noLimit = !gauge && (row.standard === null || row.standard === undefined)
                      return (
                        <tr key={row.quality_parameter_id} className="border-t border-gray-100" data-check-type={isGaugeRow(row) ? 'Gauge' : row.check_type}>
                          <td className="px-3 py-1">
                            {row.quality_parameter}
                            {gauge && (
                              <span className="block text-[10px] text-gray-500">Gauge</span>
                            )}
                          </td>
                          <td className="px-3 py-1 text-gray-500" data-testid="standard-cell">{standardText(row) ?? '—'}</td>
                          <td className="px-3 py-1 text-gray-500">{gauge ? '—' : row.upper_tolerance ?? '—'}</td>
                          <td className="px-3 py-1 text-gray-500">{gauge ? '—' : row.lower_tolerance ?? '—'}</td>
                          <td className="px-3 py-1 text-gray-500" data-testid="instrument-cell">{row.gauge_ref || '—'}</td>
                          <td className="px-3 py-1">
                            {gauge ? (
                              <GaugeButtons
                                label={`${row.quality_parameter} gauge`}
                                value={row.gauge_result}
                                onChange={(v) => handleGaugeChange(row.quality_parameter_id, v)}
                              />
                            ) : (
                            <input
                              type="number"
                              value={row.observed_value}
                              onChange={(e) => handleObservedChange(row.quality_parameter_id, e.target.value)}
                              className="border border-gray-300 rounded px-2.5 py-1.5 text-xs w-28 focus:outline-none focus:ring-2 focus:ring-bmlhblue/30"
                            />
                            )}
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
          columns={[...historyColumns, EDITED_COLUMN]}
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
  const [values, setValues] = useState(() =>
    Object.fromEntries(rows.map((r) => [r.reading_id, isGaugeRow(r) ? r.gauge_result ?? '' : String(r.observed_value ?? '')])),
  )
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
      {error && <Banner tone="error" message={error} />}
      <Field label="PRD No">
        <AutoFillBox value={first.prd_no} />
      </Field>
      <Field label="Machine">
        <AutoFillBox value={historyMachineText(first)} />
      </Field>
      <Field label="Type of Operation">
        <AutoFillBox value={first.operation} />
      </Field>
      <Field label="Date">
        <AutoFillBox value={first.log_date} />
      </Field>
      <Field label="Employee ID" required>
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
              <th className="px-3 py-1.5 font-semibold">Instrument</th>
              <th className="px-3 py-1.5 font-semibold">Observed Value</th>
              <th className="px-3 py-1.5 font-semibold">Certification</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const gauge = isGaugeRow(r)
              const noLimit = !gauge && (r.standard === null || r.standard === undefined)
              return (
                <tr key={r.reading_id} className="border-t border-gray-100">
                  <td className="px-3 py-1">
                    {r.quality_parameter}
                    {gauge && <span className="block text-[10px] text-gray-500">Gauge</span>}
                  </td>
                  <td className="px-3 py-1 text-gray-500" data-testid="standard-cell">{standardText(r) ?? '—'}</td>
                  <td className="px-3 py-1 text-gray-500">{gauge ? '—' : r.upper_tolerance ?? '—'}</td>
                  <td className="px-3 py-1 text-gray-500">{gauge ? '—' : r.lower_tolerance ?? '—'}</td>
                  <td className="px-3 py-1 text-gray-500" data-testid="instrument-cell">{r.gauge_ref || '—'}</td>
                  <td className="px-3 py-1">
                    {gauge ? (
                      <GaugeButtons
                        label={`${r.quality_parameter} gauge`}
                        value={values[r.reading_id]}
                        onChange={(val) => setValues((v) => ({ ...v, [r.reading_id]: val }))}
                      />
                    ) : (
                      <input
                        type="number"
                        value={values[r.reading_id]}
                        onChange={(e) => setValues((v) => ({ ...v, [r.reading_id]: e.target.value }))}
                        className="border border-gray-300 rounded px-2.5 py-1.5 text-xs w-28 focus:outline-none focus:ring-2 focus:ring-bmlhblue/30"
                      />
                    )}
                  </td>
                  <td className="px-3 py-1">
                    {gauge ? (
                      <StatusPill status={gaugeResultLabel(values[r.reading_id])} />
                    ) : noLimit ? (
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
