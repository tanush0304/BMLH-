import { useEffect, useState } from 'react'
import { ClipboardCheck, PlayCircle, Clock3, CheckCircle2, Lock, StopCircle } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, TextInput, SelectInput, AutoFillBox } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import usePartForPrd from '../../utils/usePartForPrd'
import HourlySlotsEntry from '../../components/HourlySlotsEntry'
import EmployeeSelect from '../../components/EmployeeSelect'
import { listEmployees } from '../../data/queries/employees'
import { listShifts } from '../../data/queries/shifts'
import { listCustomerOrders } from '../../data/queries/customerOrders'
import { getStagesForPrd, updateStageStatus, listAllStages } from '../../data/queries/routeCards'
import { getWipAggregatesForPrd } from '../../data/queries/wip'
import {
  getStageAggregatesForPrd,
  createProductionLog,
  addProductionLogHour,
  addProductionLogHours,
  getLogTotals,
  getOpenLogForStage,
  listLogHoursForLogIds,
  closeProductionLog,
  endProductionLog,
  listOpenLogsForUser,
} from '../../data/queries/productionLogs'
import { getCurrentUserId } from '../../data/queries/currentUser'
import { releasedPlannedQty, pickOpenLogForScreen } from '../../utils/productionLogLock'
import {
  computeStageAvailability,
  computeStageUpstreamTargets,
  standardQtyPerHour,
} from '../../utils/calculations'
import { resolveEntryShiftTimes } from '../../utils/hourlySlots'
import { stageLabel } from '../../utils/stageLabel'
import { todayISO } from '../../utils/dates'

/**
 * Manual-type stages (De-Burring, Final Inspection, Final Dispatch, ...)
 * have no machine and no job work code -- this reuses the exact same
 * production_logs / production_log_hours tables and is_open lock Machine
 * Entry uses for Internal stages, just without a machine-selection step.
 */
export default function ManualOperationsScreen() {
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [pendingStages, setPendingStages] = useState([]) // every Pending/Manual stage, any PRD
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [employeeId, setEmployeeId] = useState('')
  const [shiftCode, setShiftCode] = useState('')

  const [prdNo, setPrdNo] = useState('')
  const part = usePartForPrd(prdNo)
  const [stageChoiceId, setStageChoiceId] = useState('') // chosen when a PRD has more than one eligible Manual stage
  const [resolvedStage, setResolvedStage] = useState(null)
  const [plannedQty, setPlannedQty] = useState(null)
  const [stageTarget, setStageTarget] = useState(null)
  const [stageOutputSoFar, setStageOutputSoFar] = useState(0)
  const [resolving, setResolving] = useState(false)
  const [completing, setCompleting] = useState(false)

  const [starting, setStarting] = useState(false)
  const [activeLog, setActiveLog] = useState(null)
  const [logHours, setLogHours] = useState([])
  const [totals, setTotals] = useState(null)
  const [savingHour, setSavingHour] = useState(false)
  const [endingLog, setEndingLog] = useState(false)

  async function loadPendingStages() {
    const allStages = await listAllStages()
    const pending = allStages.filter((s) => s.type === 'Manual' && s.status === 'Pending')
    setPendingStages(pending)
    return pending
  }

  // Reopening the screen: if this login has an open log on a Manual stage,
  // load it straight away (PRD / stage then stay locked). Before migration
  // 024 there is no user_id column -- the query fails and the screen simply
  // starts empty, as it did before.
  async function restoreOpenLog(pending) {
    let openLogs
    try {
      openLogs = await listOpenLogsForUser(await getCurrentUserId())
    } catch {
      return
    }
    const match = pickOpenLogForScreen(openLogs, pending)
    if (!match) return
    const { log, stage } = match
    setPrdNo(log.prd_no)
    setStageChoiceId(String(stage.id))
    if (log.employee_id) setEmployeeId(log.employee_id)
    await resolveStage(log.prd_no, stage)
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [employeeRows, shf] = await Promise.all([listEmployees(), listShifts()])
        setEmployees(employeeRows)
        setShifts(shf)
        const pending = await loadPendingStages()
        await restoreOpenLog(pending)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Eligible Manual stages for the currently-selected PRD -- more than one
  // pending at once is possible (e.g. an earlier Manual stage still open
  // while a later one's upstream has also caught up), so ask which one is
  // meant rather than guessing, same as Production Data Entry does for multiple
  // eligible stages on one machine.
  const stageChoicesForPrd = prdNo ? pendingStages.filter((s) => s.prd_no === prdNo) : []

  function handlePrdChange(e) {
    if (activeLog) return // locked while a log is open
    const prd = e.target.value
    setPrdNo(prd)
    setStageChoiceId('')
    setResolvedStage(null)
    setPlannedQty(null)
    setStageTarget(null)
    setStageOutputSoFar(0)
    setActiveLog(null)
    if (!prd) return
    const choices = pendingStages.filter((s) => s.prd_no === prd)
    if (choices.length === 1) {
      resolveStage(prd, choices[0])
    }
    // If there's more than one, wait for the user to pick via
    // handleStageChoice below -- don't guess which one they mean.
  }

  function handleStageChoice(e) {
    if (activeLog) return // locked while a log is open
    const stageId = e.target.value
    setStageChoiceId(stageId)
    const stage = stageChoicesForPrd.find((s) => String(s.id) === String(stageId))
    if (stage) resolveStage(prdNo, stage)
  }

  async function resolveStage(prd, stage) {
    setResolvedStage(stage)
    setResolving(true)
    setError(null)
    try {
      const [order, allStages, aggregates, openLog, wipAggregates] = await Promise.all([
        listCustomerOrders().then((orders) => orders.find((o) => o.prd_no === prd)),
        getStagesForPrd(prd),
        getStageAggregatesForPrd(prd),
        getOpenLogForStage(prd, stage.id),
        getWipAggregatesForPrd(prd),
      ])
      const availability = computeStageAvailability(allStages, order?.order_qty ?? 0, aggregates, wipAggregates)
      const targets = computeStageUpstreamTargets(allStages, order?.order_qty ?? 0, aggregates)
      setPlannedQty(availability[stage.id] ?? 0)
      setStageTarget(targets[stage.id] ?? 0)
      setStageOutputSoFar(aggregates[stage.id]?.output ?? 0)

      if (openLog) {
        // Resume: keep logging against the log that already reserved this
        // stage's share of the upstream pool, don't open a second one.
        setActiveLog(openLog)
        // Prefill the dropdown with the shift this log started under --
        // just a convenience default, not a lock; the operator can change
        // it (e.g. resuming on a new day/shift), and that's exactly what
        // decides which shift today's new hours get stamped with.
        setShiftCode(openLog.shift_code)
        const hours = await listLogHoursForLogIds([openLog.id])
        setLogHours(hours)
        setTotals(await getLogTotals(openLog.id))
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setResolving(false)
    }
  }

  async function handleStart() {
    if (!prdNo || !resolvedStage || !employeeId || !shiftCode) {
      setError('PRD, Stage, Employee and Shift are all required to start.')
      return
    }
    setStarting(true)
    setError(null)
    try {
      const log = await createProductionLog({
        prd_no: prdNo,
        stage_id: resolvedStage.id,
        machine_id: null,
        employee_id: employeeId,
        shift_code: shiftCode,
        start_time: new Date().toISOString(),
        planned_qty: plannedQty,
        standard_qty_per_hour: standardQtyPerHour(resolvedStage.cycle_time_min),
      })
      setActiveLog(log)
      setLogHours([])
      setTotals(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setStarting(false)
    }
  }

  async function refreshAfterHourSave() {
    setTotals(await getLogTotals(activeLog.id))
    const aggregates = await getStageAggregatesForPrd(prdNo)
    setStageOutputSoFar(aggregates[resolvedStage.id]?.output ?? 0)
  }

  // Migration 010: each hour row now carries its own log_date/shift_code/
  // employee_id -- these must be sent explicitly here (today's date, the
  // currently-selected shift and user), never left to a trigger default,
  // since they're what makes multi-shift/multi-day logging on one log
  // attributable per hour instead of all defaulting to the log header's
  // original creation-time values.
  async function handleSaveHours(rows) {
    if (!activeLog) return
    setSavingHour(true)
    setError(null)
    try {
      const stamped = rows.map((r) => ({
        ...r,
        log_id: activeLog.id,
        log_date: todayISO(),
        shift_code: shiftCode,
        employee_id: employeeId,
      }))
      const saved = await addProductionLogHours(stamped)
      setLogHours((h) => [...h, ...saved])
      await refreshAfterHourSave()
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingHour(false)
    }
  }

  async function handleAddExtraHour(row) {
    if (!activeLog) return
    setSavingHour(true)
    setError(null)
    try {
      const saved = await addProductionLogHour({
        ...row,
        log_id: activeLog.id,
        log_date: todayISO(),
        shift_code: shiftCode,
        employee_id: employeeId,
      })
      setLogHours((h) => [...h, saved])
      await refreshAfterHourSave()
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingHour(false)
    }
  }

  async function handleMarkComplete() {
    if (!resolvedStage) return
    setCompleting(true)
    setError(null)
    try {
      await updateStageStatus(resolvedStage.id, 'Completed')
      if (activeLog) await closeProductionLog(activeLog.id)
      await clearSelection()
    } catch (e) {
      setError(e.message)
    } finally {
      setCompleting(false)
    }
  }

  // Close the open log without completing the stage (switching operation
  // mid-stage). The stage stays Pending; the log's unused reservation goes
  // back to the pool (see endProductionLog). Employee and Shift are kept.
  async function handleEndLog() {
    if (!activeLog) return
    if (!window.confirm('End this log without completing the stage? You can start a new log afterwards.')) return
    setEndingLog(true)
    setError(null)
    try {
      const hours = await listLogHoursForLogIds([activeLog.id])
      await endProductionLog(activeLog.id, releasedPlannedQty(activeLog.planned_qty, hours))
      await clearSelection()
    } catch (e) {
      setError(e.message)
    } finally {
      setEndingLog(false)
    }
  }

  async function clearSelection() {
    setPrdNo('')
    setStageChoiceId('')
    setResolvedStage(null)
    setPlannedQty(null)
    setStageTarget(null)
    setStageOutputSoFar(0)
    setActiveLog(null)
    setLogHours([])
    setTotals(null)
    await loadPendingStages()
  }

  const noEligibleStage = prdNo && !resolving && stageChoicesForPrd.length === 0
  const entryShift = resolveEntryShiftTimes({ dropdownShiftCode: shiftCode, shifts })

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader
        title="Manual Operations"
        subtitle="Log De-Burring, Final Inspection & Final Dispatch"
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}

        <FormSection icon={ClipboardCheck} title="1. Select Employee & Order" subtitle="Pick who, then order" columns={3}>
          <Field label="Employee" required>
            <EmployeeSelect employees={employees} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
          </Field>
          <Field label="Production Order (PRD No)" required>
            <SearchableSelect
              value={prdNo}
              onChange={handlePrdChange}
              disabled={!!activeLog}
              options={[...new Set(pendingStages.map((s) => s.prd_no))]}
            />
          </Field>
          <Field label="Part Serial Number">
            <AutoFillBox value={part.part_serial_number} />
          </Field>
          <Field label="Part Name">
            <AutoFillBox value={part.part_name} />
          </Field>
          <Field label="Part Drawing Number">
            <AutoFillBox value={part.part_drawing_reference_number} />
          </Field>
          {stageChoicesForPrd.length > 1 && (
            <Field label="Which Stage?" required>
              <SearchableSelect
                value={stageChoiceId}
                onChange={handleStageChoice}
                disabled={!!activeLog}
                options={stageChoicesForPrd.map((s) => ({ value: s.id, label: stageLabel(s) }))}
              />
            </Field>
          )}
          {resolving && <div className="flex items-end text-sm text-gray-400">Resolving...</div>}
          {activeLog && resolvedStage && (
            <p className="sm:col-span-3 flex items-start gap-2 text-xs text-[#0A4CB0] bg-[#EAF2FD] border border-[#A9C8EE] rounded px-3 py-2">
              <Lock size={14} className="mt-px shrink-0" aria-hidden="true" />
              <span>
                Log open: PRD <strong>{activeLog.prd_no}</strong> · {stageLabel(resolvedStage)} · started{' '}
                {activeLog.start_time ? new Date(activeLog.start_time).toLocaleString() : '—'}. PRD and Stage are
                locked until you End Log or Mark Stage Complete.
              </span>
            </p>
          )}
          {noEligibleStage && (
            <p className="text-sm text-amber-600 sm:col-span-3">
              This order has no reachable Manual stage right now.
            </p>
          )}
          {stageChoicesForPrd.length > 1 && (
            <p className="text-xs text-amber-700 sm:col-span-3">
              This PRD has {stageChoicesForPrd.length} Manual stages pending at once -- pick the one you're
              actually working on.
            </p>
          )}
        </FormSection>

        {resolvedStage && (
          <FormSection icon={PlayCircle} title="2. Auto-Resolved Stage" subtitle="Stage resolved automatically" columns={3}>
            <Field label="Operation">
              <TextInput value={resolvedStage.operation} disabled />
            </Field>
            <Field label="Cycle Time (min)">
              <TextInput value={resolvedStage.cycle_time_min ?? ''} disabled />
            </Field>
            <Field label="Standard Qty / Hour">
              <TextInput value={standardQtyPerHour(resolvedStage.cycle_time_min)?.toFixed(2) ?? ''} disabled />
            </Field>
            <Field label="Planned Qty (available from upstream)">
              <TextInput value={plannedQty ?? ''} disabled />
            </Field>
            <Field label="Shift" required>
              <SelectInput
                value={shiftCode}
                onChange={(e) => setShiftCode(e.target.value)}
                options={shifts.map((s) => s.shift_code)}
              />
            </Field>
            {activeLog && (
              <p className="text-xs text-gray-500 sm:col-span-3">
                This log started under Shift {activeLog.shift_code} -- the dropdown stays live and decides which
                shift any NEW hours get logged under, today or on a future day.
              </p>
            )}
            <div className="flex items-end">
              <button
                onClick={handleStart}
                disabled={starting || !!activeLog || !plannedQty}
                className="bg-green-600 text-white rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-green-700"
              >
                {activeLog ? 'Started' : starting ? 'Starting...' : 'Start'}
              </button>
            </div>
          </FormSection>
        )}

        {activeLog && (
          <FormSection icon={Clock3} title="3. Hourly Entry" subtitle="One row per hour of the selected shift">
            <div className="w-full">
              <HourlySlotsEntry
                startTime={entryShift.start_time}
                endTime={entryShift.end_time}
                shiftCode={entryShift.shiftCode}
                logHours={logHours}
                employees={employees}
                onSaveHours={handleSaveHours}
                onAddExtraHour={handleAddExtraHour}
                saving={savingHour}
                resetKey={activeLog.id}
              />
              {totals && (
                <div className="text-sm text-gray-600 flex flex-wrap gap-x-6 gap-y-1 pt-2 mt-2 border-t border-gray-100">
                  <span>Total Produced: <strong className="num-highlight">{totals.total_produced}</strong></span>
                  <span>Total Rejected: <strong className="num-highlight">{totals.total_rejected ?? 0}</strong></span>
                  <span>Total Rework: <strong className="num-highlight">{totals.total_rework ?? 0}</strong></span>
                  <span>Efficiency: <strong className="num-highlight">{totals.efficiency_pct ?? '—'}%</strong></span>
                  <span>Reject %: <strong className="num-highlight">{totals.reject_pct ?? '—'}%</strong></span>
                  <span>Rework %: <strong className="num-highlight">{totals.rework_pct ?? '—'}%</strong></span>
                </div>
              )}
            </div>
          </FormSection>
        )}

        {resolvedStage && stageTarget !== null && (
          <div className="bg-white border border-gray-200 rounded-md px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-gray-600">
              Stage output so far: <strong>{stageOutputSoFar}</strong> / target <strong>{stageTarget}</strong>
            </p>
            <div className="flex items-center gap-2">
            {activeLog && (
              <button
                onClick={handleEndLog}
                disabled={endingLog || completing}
                className="inline-flex items-center gap-1.5 bg-gray-600 text-white rounded px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-gray-700"
              >
                <StopCircle size={15} />
                {endingLog ? 'Ending...' : 'End Log'}
              </button>
            )}
            {stageOutputSoFar >= stageTarget && stageTarget > 0 && (
              <button
                onClick={handleMarkComplete}
                disabled={completing}
                className="inline-flex items-center gap-1.5 bg-green-600 text-white rounded px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-green-700"
              >
                <CheckCircle2 size={15} />
                {completing ? 'Marking Complete...' : 'Mark Stage Complete'}
              </button>
            )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
