import { useEffect, useState } from 'react'
import { Factory, PlayCircle, Clock3, CheckCircle2, ShieldCheck } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import HourlySlotsEntry from '../../components/HourlySlotsEntry'
import EmployeeSelect from '../../components/EmployeeSelect'
import { listEmployees } from '../../data/queries/employees'
import { listShifts } from '../../data/queries/shifts'
import { listMachines } from '../../data/queries/machines'
import { listCustomerOrders } from '../../data/queries/customerOrders'
import { getStagesForPrd, updateStageStatus, listAllStages } from '../../data/queries/routeCards'
import { listMachinesForProductSeqs } from '../../data/queries/machineEntry'
import { buildMachineLabelMap } from '../../utils/machineLabel'
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
  verifyProductionLog,
} from '../../data/queries/productionLogs'
import { listCycleTimesForPart } from '../../data/queries/cycleTimes'
import { getCurrentUserId } from '../../data/queries/currentUser'
import {
  computeStageAvailability,
  computeStageUpstreamTargets,
  standardQtyPerHour,
} from '../../utils/calculations'
import { resolveEntryShiftTimes } from '../../utils/hourlySlots'
import { pickCycleTime } from '../../utils/productionReport'
import { todayISO } from '../../utils/dates'

export default function MachineEntryScreen({ role }) {
  // Shift-incharge verification is supervisor/admin only -- hidden here,
  // and enforced by migration 017's trigger regardless of the UI.
  const canVerify = role === 'supervisor' || role === 'admin'
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [machineLabels, setMachineLabels] = useState({}) // machine_id -> "Name (ID)", for dropdown display only
  const [pendingStages, setPendingStages] = useState([]) // every Pending/Internal stage, any PRD -- for the PRD dropdown
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [employeeId, setEmployeeId] = useState('')
  const [shiftCode, setShiftCode] = useState('')

  const [prdNo, setPrdNo] = useState('')
  const [prdStages, setPrdStages] = useState([]) // this PRD's own eligible stages, any machine
  const [machineOpsForPrd, setMachineOpsForPrd] = useState([]) // {machine_id, seq} rows -- Cycle Time Master's record of which machines can run which of prdStages' seqs
  const [resolving, setResolving] = useState(false)

  const [machineId, setMachineId] = useState('')
  const [stageChoiceId, setStageChoiceId] = useState('') // chosen when a PRD has more than one eligible stage on this machine
  const [resolvedStage, setResolvedStage] = useState(null)
  const [plannedQty, setPlannedQty] = useState(null)
  const [stageTarget, setStageTarget] = useState(null)
  const [stageOutputSoFar, setStageOutputSoFar] = useState(0)
  const [completing, setCompleting] = useState(false)

  const [starting, setStarting] = useState(false)
  const [activeLog, setActiveLog] = useState(null)
  const [logHours, setLogHours] = useState([])
  const [totals, setTotals] = useState(null)
  const [savingHour, setSavingHour] = useState(false)

  // Hourly Production Report header (migration 017)
  const [setterId, setSetterId] = useState('')
  const [settingTimeMin, setSettingTimeMin] = useState('')
  const [masterCycleTime, setMasterCycleTime] = useState(null) // Cycle Time Master, part + seq (+ machine)
  const [verifying, setVerifying] = useState(false)

  async function loadPendingStages() {
    const allStages = await listAllStages()
    setPendingStages(allStages.filter((s) => s.type === 'Internal' && s.status === 'Pending'))
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [employeeRows, shf, machs] = await Promise.all([listEmployees(), listShifts(), listMachines()])
        setEmployees(employeeRows)
        setShifts(shf)
        setMachineLabels(buildMachineLabelMap(machs))
        await loadPendingStages()
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Machines eligible for the currently-selected PRD -- distinct machine_ids
  // capable of at least one of this PRD's eligible stage operations.
  const eligibleMachineIds = [...new Set(machineOpsForPrd.map((r) => r.machine_id))]

  async function handlePrdChange(e) {
    const prd = e.target.value
    setPrdNo(prd)
    setMachineId('')
    setStageChoiceId('')
    setResolvedStage(null)
    setPlannedQty(null)
    setStageTarget(null)
    setStageOutputSoFar(0)
    setActiveLog(null)
    resetReportHeader()
    setMachineOpsForPrd([])
    if (!prd) {
      setPrdStages([])
      return
    }
    setResolving(true)
    setError(null)
    try {
      const stages = pendingStages.filter((s) => s.prd_no === prd)
      setPrdStages(stages)
      // Eligibility comes from Cycle Time Master (part_serial_number + seq +
      // machine_id), not from matching operation text against "machine
      // operations" -- that table is Machine Master's own informational
      // operation list, never used to decide this. See
      // utils/machineEligibility.js.
      const order = (await listCustomerOrders()).find((o) => o.prd_no === prd)
      const seqs = [...new Set(stages.map((s) => s.seq))]
      setMachineOpsForPrd(await listMachinesForProductSeqs(order?.part_serial_number, seqs))
    } catch (e) {
      setError(e.message)
    } finally {
      setResolving(false)
    }
  }

  // Stages eligible for the currently-selected PRD on the currently-selected
  // machine -- more than one is a real, expected case (WIP can feed any
  // stage), not an edge case to collapse silently.
  const stageChoicesForPrd = machineId
    ? prdStages.filter((s) => machineOpsForPrd.some((r) => r.machine_id === machineId && r.seq === s.seq))
    : []

  function handleMachineChange(e) {
    const id = e.target.value
    setMachineId(id)
    setStageChoiceId('')
    setResolvedStage(null)
    setPlannedQty(null)
    setStageTarget(null)
    setStageOutputSoFar(0)
    setActiveLog(null)
    resetReportHeader()
    if (!id) return
    const choices = prdStages.filter((s) =>
      machineOpsForPrd.some((r) => r.machine_id === id && r.seq === s.seq)
    )
    if (choices.length === 1) {
      resolveStage(prdNo, choices[0], id)
    }
    // If there's more than one, wait for the user to pick via
    // handleStageChoice below -- don't guess which one they mean.
  }

  function handleStageChoice(e) {
    const stageId = e.target.value
    setStageChoiceId(stageId)
    const stage = stageChoicesForPrd.find((s) => String(s.id) === String(stageId))
    if (stage) resolveStage(prdNo, stage, machineId)
  }

  function resetReportHeader() {
    setSetterId('')
    setSettingTimeMin('')
    setMasterCycleTime(null)
  }

  async function resolveStage(prd, stage, machine) {
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
      const cycleRows = await listCycleTimesForPart(order?.part_serial_number)
      setMasterCycleTime(
        pickCycleTime(cycleRows, { partSerialNumber: order?.part_serial_number, seq: stage.seq, machineId: machine })
      )

      if (openLog) {
        // Resume: keep logging against the log that already reserved this
        // stage's share of the upstream pool, don't open a second one.
        setActiveLog(openLog)
        // Prefill the dropdown with the shift this log started under --
        // just a convenience default, not a lock; the operator can change
        // it (e.g. resuming on a new day/shift), and that's exactly what
        // decides which shift today's new hours get stamped with.
        setShiftCode(openLog.shift_code)
        setSetterId(openLog.setter_employee_id ?? '')
        setSettingTimeMin(openLog.setting_time_min ?? '')
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
    if (!machineId || !prdNo || !resolvedStage || !employeeId || !shiftCode) {
      setError('Machine, PRD, Employee and Shift are all required to start.')
      return
    }
    const settingTime = settingTimeMin === '' ? null : Number(settingTimeMin)
    if (settingTime !== null && (!Number.isInteger(settingTime) || settingTime < 0)) {
      setError('Setting Time must be a whole number of minutes, 0 or more.')
      return
    }
    setStarting(true)
    setError(null)
    try {
      const log = await createProductionLog({
        prd_no: prdNo,
        stage_id: resolvedStage.id,
        machine_id: machineId,
        employee_id: employeeId,
        shift_code: shiftCode,
        start_time: new Date().toISOString(),
        planned_qty: plannedQty,
        standard_qty_per_hour: standardQtyPerHour(resolvedStage.cycle_time_min),
        setter_employee_id: setterId || null,
        setting_time_min: settingTime,
        cycle_time_min: masterCycleTime,
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

  // Shared refresh after either the bulk shift-slot save or the single
  // extra-hour add below -- same stage-output recompute the old single
  // handleAddHour used to do inline.
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

  async function handleVerify() {
    if (!activeLog) return
    setVerifying(true)
    setError(null)
    try {
      setActiveLog(await verifyProductionLog(activeLog.id, await getCurrentUserId()))
    } catch (e) {
      setError(e.message)
    } finally {
      setVerifying(false)
    }
  }

  async function handleMarkComplete() {
    if (!resolvedStage) return
    setCompleting(true)
    setError(null)
    try {
      await updateStageStatus(resolvedStage.id, 'Completed')
      if (activeLog) await closeProductionLog(activeLog.id)
      // Stage is done -- clear the resolved state and refresh the pending
      // stage list (the next stage, if Internal, will now show up).
      setPrdNo('')
      setMachineId('')
      setStageChoiceId('')
      setResolvedStage(null)
      setPlannedQty(null)
      setStageTarget(null)
      setStageOutputSoFar(0)
      setActiveLog(null)
      resetReportHeader()
      setLogHours([])
      setTotals(null)
      setPrdStages([])
      setMachineOpsForPrd([])
      await loadPendingStages()
    } catch (e) {
      setError(e.message)
    } finally {
      setCompleting(false)
    }
  }

  const noEligibleMachine = prdNo && !resolving && eligibleMachineIds.length === 0
  const entryShift = resolveEntryShiftTimes({ dropdownShiftCode: shiftCode, shifts })

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader
        title="Machine Entry"
        subtitle="Employee picks the order + machine; the stage resolves itself"
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}

        <FormSection icon={Factory} title="1. Select Employee, Order & Machine" subtitle="Pick who, then order and machine" columns={3}>
          <Field label="Employee" required>
            <EmployeeSelect employees={employees} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
          </Field>
          <Field label="Production Order (PRD No)" required>
            <SelectInput
              value={prdNo}
              onChange={handlePrdChange}
              options={[...new Set(pendingStages.map((s) => s.prd_no))]}
            />
          </Field>
          <Field label="Machine" required>
            <SelectInput
              value={machineId}
              onChange={handleMachineChange}
              disabled={!prdNo || eligibleMachineIds.length === 0}
              options={eligibleMachineIds.map((id) => ({ value: id, label: machineLabels[id] ?? id }))}
            />
          </Field>
          {stageChoicesForPrd.length > 1 && (
            <Field label="Which Stage?" required>
              <SelectInput
                value={stageChoiceId}
                onChange={handleStageChoice}
                options={stageChoicesForPrd.map((s) => ({ value: s.id, label: `Seq ${s.seq} - ${s.operation}` }))}
              />
            </Field>
          )}
          {resolving && <div className="flex items-end text-sm text-gray-400">Resolving...</div>}
          {noEligibleMachine && (
            <p className="text-sm text-amber-600 sm:col-span-3">
              No machine is currently set up to perform the operation this production order needs next.
            </p>
          )}
          {stageChoicesForPrd.length > 1 && (
            <p className="text-xs text-amber-700 sm:col-span-3">
              This PRD has {stageChoicesForPrd.length} stages open on this machine at once -- pick the one you're
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
              <TextInput value={activeLog?.cycle_time_min ?? masterCycleTime ?? ''} disabled />
            </Field>
            <Field label="Standard Qty / Hour">
              <TextInput value={standardQtyPerHour(resolvedStage.cycle_time_min)?.toFixed(2) ?? ''} disabled />
            </Field>
            <Field label="Planned Qty (available from upstream)">
              <TextInput value={plannedQty ?? ''} disabled />
            </Field>
            <Field label="Setter">
              <EmployeeSelect
                employees={employees}
                value={setterId}
                onChange={(e) => setSetterId(e.target.value)}
                disabled={!!activeLog}
              />
            </Field>
            <Field label="Setting Time (min)">
              <TextInput
                type="number"
                min="0"
                step="1"
                value={settingTimeMin}
                onChange={(e) => setSettingTimeMin(e.target.value)}
                disabled={!!activeLog}
              />
            </Field>
            {masterCycleTime == null && !activeLog?.cycle_time_min && (
              <p className="text-xs text-amber-700 sm:col-span-3">
                No Cycle Time Master entry for this part + process -- cycle time will be left blank on the report.
              </p>
            )}
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
                {activeLog ? 'Started' : starting ? 'Starting...' : 'Start Production'}
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
                showIdle
                settingTimeMin={activeLog.setting_time_min}
              />
              {totals && (
                <div className="text-sm text-gray-600 flex gap-6 pt-2 mt-2 border-t border-gray-100">
                  <span>Total Produced: <strong>{totals.total_produced}</strong></span>
                  <span>Efficiency: <strong>{totals.efficiency_pct ?? '—'}%</strong></span>
                  <span>Reject %: <strong>{totals.reject_pct ?? '—'}%</strong></span>
                  <span>Rework %: <strong>{totals.rework_pct ?? '—'}%</strong></span>
                </div>
              )}
              <div className="flex items-center gap-3 pt-2 mt-2 border-t border-gray-100 text-sm">
                <ShieldCheck size={16} className={activeLog.verified_at ? 'text-green-600' : 'text-gray-400'} />
                {activeLog.verified_at ? (
                  <span className="text-green-700">
                    Verified by shift incharge on {new Date(activeLog.verified_at).toLocaleString()}
                  </span>
                ) : canVerify ? (
                  <button
                    onClick={handleVerify}
                    disabled={verifying}
                    className="bg-bmlhblue text-white rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                  >
                    {verifying ? 'Verifying...' : 'Mark Verified (Shift Incharge)'}
                  </button>
                ) : (
                  <span className="text-gray-500">Awaiting shift-incharge verification</span>
                )}
              </div>
            </div>
          </FormSection>
        )}

        {resolvedStage && stageTarget !== null && (
          <div className="bg-white border border-gray-200 rounded-md px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-gray-600">
              Stage output so far: <strong>{stageOutputSoFar}</strong> / target <strong>{stageTarget}</strong>
            </p>
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
        )}
      </div>
    </div>
  )
}
