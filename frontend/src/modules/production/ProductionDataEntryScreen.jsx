import { useEffect, useState } from 'react'
import { Factory, PlayCircle, Clock3, CheckCircle2, Lock, StopCircle } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, TextInput, SelectInput, AutoFillBox } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import usePartForPrd from '../../utils/usePartForPrd'
import HourlySlotsEntry from '../../components/HourlySlotsEntry'
import EmployeeSelect from '../../components/EmployeeSelect'
import { listEmployees } from '../../data/queries/employees'
import { listShifts } from '../../data/queries/shifts'
import { listMachines } from '../../data/queries/machines'
import { listOrdersByPrd } from '../../data/queries/customerOrders'
import { getStagesForPrd, updateStageStatus, listAllStages } from '../../data/queries/routeCards'
import { listAllMachineOperations } from '../../data/queries/machineOperations'
import { machinesForStage, openLogsWithSeq, validateSubstituteReason, substituteReasonRequired, cycleTimeForMachine } from '../../utils/machineEligibility'
import { MACHINE_CHOICE_MODE, SUBSTITUTE_REASONS } from '../../utils/constants'
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
  endProductionLog,
  updateProductionLogHours,
  listOpenLogsForUser,
  listAllOpenLogs,
} from '../../data/queries/productionLogs'
import { listCycleTimesForPart } from '../../data/queries/cycleTimes'
import { getCurrentUserId } from '../../data/queries/currentUser'
import {
  computeStageAvailability,
  computeStageUpstreamTargets,
  standardQtyPerHour,
} from '../../utils/calculations'
import { resolveEntryShiftTimes } from '../../utils/hourlySlots'
import { computeLiveLogTotals } from '../../utils/productionReport'
import { todayISO } from '../../utils/dates'
import ShiftDateLine from '../../components/ShiftDateLine'
import { stageLabel } from '../../utils/stageLabel'
import { useAppUsers } from '../../components/StockEditPanel'
import { subItemLabel } from '../../utils/constants'
import { releasedPlannedQty, pickOpenLogForScreen } from '../../utils/productionLogLock'
import useLogShiftVerifications from '../../utils/useLogShiftVerifications'
import { decisionText } from '../../utils/shiftVerification'
import ShiftVerificationStatus, { CorrectingShiftBanner } from '../../components/ShiftVerificationStatus'
import { dbErrorMessage } from '../../utils/dbErrors'
import StageStartGuard from '../../components/StageStartGuard'
import { pickDefaultStage, defaultMachineForStage, earlierIncompleteStage, canStartStage, runningBanner } from '../../utils/stageStartGuard'

export default function ProductionDataEntryScreen({ role }) {
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [machineLabels, setMachineLabels] = useState({}) // machine_id -> "Name (ID)", for dropdown display only
  const [machineRows, setMachineRows] = useState([]) // "machines master" rows (machinesForStage)
  const [optionsBySeq, setOptionsBySeq] = useState({}) // seq -> machinesForStage() options (labels: planned / busy)
  const [nextStageSeq, setNextStageSeq] = useState(null)
  const [substituteReason, setSubstituteReason] = useState('')
  const [substituteNote, setSubstituteNote] = useState('')
  const [cycleNote, setCycleNote] = useState('')
  const [pendingStages, setPendingStages] = useState([]) // every Pending/Internal stage, any PRD -- for the PRD dropdown
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [employeeId, setEmployeeId] = useState('')
  const [shiftCode, setShiftCode] = useState('')

  const [prdNo, setPrdNo] = useState('')
  const part = usePartForPrd(prdNo)
  const [prdStages, setPrdStages] = useState([]) // this PRD's own eligible stages, any machine
  const [machineOpsForPrd, setMachineOpsForPrd] = useState([]) // {machine_id, seq} rows -- Cycle Time Master's record of which machines can run which of prdStages' seqs
  const [resolving, setResolving] = useState(false)
  const [prdAllStages, setPrdAllStages] = useState([]) // every stage of the PRD (any type / status) -- earlier-stage check
  const [nextStageMachineId, setNextStageMachineId] = useState('') // default pick, labelled "(next stage)"
  const [confirmEarlier, setConfirmEarlier] = useState(false) // "I confirm" for an incomplete earlier stage

  const [machineId, setMachineId] = useState('')
  const [stageChoiceId, setStageChoiceId] = useState('') // chosen when a PRD has more than one eligible stage on this machine
  const [resolvedStage, setResolvedStage] = useState(null)
  const [plannedQty, setPlannedQty] = useState(null)
  const [stageTarget, setStageTarget] = useState(null)
  const [stageOutputSoFar, setStageOutputSoFar] = useState(0)
  const [completing, setCompleting] = useState(false)

  const [starting, setStarting] = useState(false)
  const [activeLog, setActiveLog] = useState(null)
  // Shift verification (migration 028) is per log + date + shift and is
  // done on the Shift Verification screen. The grid's shift is locked once
  // Approved (except for admin); a Rejected shift shows its reason and stays
  // editable. entryDate is today, or an earlier date while correcting a
  // Rejected shift.
  const appUsers = useAppUsers()
  const [entryDate, setEntryDate] = useState(todayISO())
  const shiftCheck = useLogShiftVerifications({ logId: activeLog?.id, entryDate, shiftCode, role, appUsers })
  const [logHours, setLogHours] = useState([])
  const [totals, setTotals] = useState(null)
  const [draftHourRows, setDraftHourRows] = useState([])
  const [savingHour, setSavingHour] = useState(false)

  // Hourly Production Report header (migration 017)
  const [setterId, setSetterId] = useState('')
  const [settingTimeMin, setSettingTimeMin] = useState('')
  const [masterCycleTime, setMasterCycleTime] = useState(null) // Cycle Time Master, part + seq (+ machine)
  const [endingLog, setEndingLog] = useState(false)

  async function loadPendingStages() {
    const allStages = await listAllStages()
    const pending = allStages.filter((s) => s.type === 'Internal' && s.status === 'Pending')
    setPendingStages(pending)
    return pending
  }

  // Reopening the screen: if this login has an open log on an Internal stage,
  // load it straight away (PRD / machine / stage then stay locked). Before
  // migration 024 there is no user_id column -- the query fails and the
  // screen simply starts empty, as it did before.
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
    await selectPrd(log.prd_no, pending, { autoPick: false })
    setMachineId(log.machine_id ?? '')
    setStageChoiceId(String(stage.id))
    if (log.employee_id) setEmployeeId(log.employee_id)
    await resolveStage(log.prd_no, stage, log.machine_id)
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
        setMachineRows(machs)
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

  // Machines eligible for the currently-selected PRD -- distinct machine_ids
  // capable of at least one of this PRD's eligible stage operations.
  const eligibleMachineIds = [...new Set(machineOpsForPrd.map((r) => r.machine_id))]

  async function handlePrdChange(e) {
    if (activeLog) return // locked while a log is open
    await selectPrd(e.target.value, pendingStages)
  }

  async function selectPrd(prd, pending, { autoPick = true } = {}) {
    setPrdNo(prd)
    setMachineId('')
    setNextStageMachineId('')
    setNextStageSeq(null)
    setOptionsBySeq({})
    setPrdAllStages([])
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
      const stages = pending.filter((s) => s.prd_no === prd)
      setPrdStages(stages)
      // Eligibility comes from Cycle Time Master (part_serial_number + seq +
      // machine_id), not from matching operation text against "machine
      // operations" -- that table is Machine Master's own informational
      // operation list, never used to decide this. See
      // utils/machineEligibility.js.
      const order = (await listOrdersByPrd()).find((o) => o.prd_no === prd)
      const seqs = [...new Set(stages.map((s) => s.seq))]
      // Machine options per pending stage (MACHINE_CHOICE_MODE, utils/machineEligibility):
      // planned machine first, substitutes, busy machines labelled.
      const [cycleRows, machineOps, openLogs, machs] = await Promise.all([
        listCycleTimesForPart(order?.part_serial_number),
        listAllMachineOperations(),
        listAllOpenLogs(),
        machineRows.length ? machineRows : listMachines(),
      ])
      const busyLogs = openLogsWithSeq(openLogs, pending)
      const bySeq = {}
      for (const st of stages.filter((x) => seqs.includes(x.seq))) {
        bySeq[st.seq] = machinesForStage({ mode: MACHINE_CHOICE_MODE, stage: st, machineOps, machines: machs, cycleTimeRows: cycleRows, openLogs: busyLogs })
      }
      setOptionsBySeq(bySeq)
      const rows = Object.entries(bySeq).flatMap(([seq, opts]) => opts.map((o) => ({ machine_id: o.machine_id, seq: Number(seq) })))
      setMachineOpsForPrd(rows)
      if (autoPick) {
        // Default: the machine of the EARLIEST pending stage (route card
        // order) that has something available -- labelled "(next stage)".
        const [allStages, aggregates, wipAggregates] = await Promise.all([
          getStagesForPrd(prd),
          getStageAggregatesForPrd(prd),
          getWipAggregatesForPrd(prd),
        ])
        const availability = computeStageAvailability(allStages, order?.prd_qty ?? 0, aggregates, wipAggregates)
        const candidates = stages.filter((s) => rows.some((r) => r.seq === s.seq))
        const next = pickDefaultStage(candidates, availability)
        const machine = defaultMachineForStage(next, rows)
        if (next && machine) {
          setNextStageMachineId(machine)
          setNextStageSeq(next.seq)
          selectMachine(machine, { stages, rows, prd, preferStage: next })
        }
      }
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
    if (activeLog) return // locked while a log is open
    selectMachine(e.target.value)
  }

  // ctx: values from selectPrd before React state has caught up (default pick).
  function selectMachine(id, ctx = {}) {
    const stagesNow = ctx.stages ?? prdStages
    const rowsNow = ctx.rows ?? machineOpsForPrd
    const prdNow = ctx.prd ?? prdNo
    setMachineId(id)
    setConfirmEarlier(false)
    setSubstituteReason('')
    setSubstituteNote('')
    setStageChoiceId('')
    setResolvedStage(null)
    setPlannedQty(null)
    setStageTarget(null)
    setStageOutputSoFar(0)
    setActiveLog(null)
    resetReportHeader()
    if (!id) return
    const choices = stagesNow.filter((s) =>
      rowsNow.some((r) => r.machine_id === id && r.seq === s.seq)
    )
    if (choices.length === 1) {
      resolveStage(prdNow, choices[0], id)
    } else if (ctx.preferStage && choices.some((s) => s.id === ctx.preferStage.id)) {
      setStageChoiceId(String(ctx.preferStage.id))
      resolveStage(prdNow, ctx.preferStage, id)
    }
    // If there's more than one, wait for the user to pick via
    // handleStageChoice below -- don't guess which one they mean.
  }

  function handleStageChoice(e) {
    if (activeLog) return // locked while a log is open
    const stageId = e.target.value
    setStageChoiceId(stageId)
    const stage = stageChoicesForPrd.find((s) => String(s.id) === String(stageId))
    setConfirmEarlier(false)
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
        listOrdersByPrd().then((orders) => orders.find((o) => o.prd_no === prd)),
        getStagesForPrd(prd),
        getStageAggregatesForPrd(prd),
        getOpenLogForStage(prd, stage.id),
        getWipAggregatesForPrd(prd),
      ])
      const availability = computeStageAvailability(allStages, order?.prd_qty ?? 0, aggregates, wipAggregates)
      const targets = computeStageUpstreamTargets(allStages, order?.prd_qty ?? 0, aggregates)
      setPrdAllStages(allStages)
      setPlannedQty(availability[stage.id] ?? 0)
      setStageTarget(targets[stage.id] ?? 0)
      setStageOutputSoFar(aggregates[stage.id]?.output ?? 0)
      const cycleRows = await listCycleTimesForPart(order?.part_serial_number)
      // Chosen machine's own Cycle Time row, else the stage's frozen time (+ note).
      const ct = cycleTimeForMachine({ cycleTimeRows: cycleRows, seq: stage.seq, chosenId: machine, plannedId: stage.machine_id, frozenCycleTime: stage.cycle_time_min })
      setMasterCycleTime(ct.cycleTimeMin)
      setCycleNote(ct.note)

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
    if (!canStartStage({ available: plannedQty, earlierIncomplete, confirmed: confirmEarlier })) return
    if (substituteError) {
      setError(substituteError)
      return
    }
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
        // 040: planned_machine_id is set by the DB from the stage; the reason
        // only when running on another machine.
        substitute_reason: substituteNeeded ? substituteReason : null,
        substitute_reason_note: substituteNeeded && substituteNote.trim() ? substituteNote.trim() : null,
      })
      setActiveLog(log)
      setLogHours([])
      setTotals(null)
    } catch (e) {
      setError(dbErrorMessage(e))
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
  // `changes`: edits to already-saved rows of the grid's shift (only the
  // changed ones) -- updated in place, keeping their original employee.
  async function handleSaveHours(rows, changes = []) {
    if (!activeLog) return
    setSavingHour(true)
    setError(null)
    try {
      const stamped = rows.map((r) => ({
        ...r,
        log_id: activeLog.id,
        log_date: entryDate,
        shift_code: shiftCode,
        employee_id: employeeId,
      }))
      const [saved, updated] = await Promise.all([addProductionLogHours(stamped), updateProductionLogHours(changes)])
      const updatedById = new Map(updated.map((u) => [u.id, u]))
      setLogHours((h) => [...h.map((x) => updatedById.get(x.id) ?? x), ...saved])
      await Promise.all([refreshAfterHourSave(), shiftCheck.resubmitted(entryDate, shiftCode)])
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
        log_date: entryDate,
        shift_code: shiftCode,
        employee_id: employeeId,
      })
      setLogHours((h) => [...h, saved])
      await Promise.all([refreshAfterHourSave(), shiftCheck.resubmitted(entryDate, shiftCode)])
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
      // Stage is done -- clear the resolved state and refresh the pending
      // stage list (the next stage, if Internal, will now show up).
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
    setEntryDate(todayISO())
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
  }

  const earlierIncomplete = resolvedStage ? earlierIncompleteStage(prdAllStages, resolvedStage) : null
  const plannedMachineId = activeLog?.planned_machine_id ?? resolvedStage?.machine_id ?? null
  const substituteNeeded = !activeLog && substituteReasonRequired(machineId, resolvedStage?.machine_id)
  const substituteError = substituteNeeded
    ? validateSubstituteReason({ chosenId: machineId, plannedId: resolvedStage?.machine_id, reason: substituteReason, note: substituteNote })
    : null
  // Dropdown label: from the stage in focus (resolved, else the next stage);
  // a machine only listed for another stage shows without "(planned)".
  const focusSeq = resolvedStage?.seq ?? nextStageSeq
  function optionLabel(id) {
    const own = optionsBySeq[focusSeq]?.find((o) => o.machine_id === id)
    if (own) return own.label
    const other = Object.values(optionsBySeq).flat().find((o) => o.machine_id === id)
    return other ? other.label.replace(' (planned)', '') : machineLabels[id] ?? id
  }
  const actualMachineText = (actualId) =>
    `${machineLabels[actualId] ?? actualId}${plannedMachineId && plannedMachineId !== actualId ? ` (planned ${plannedMachineId})` : ''}`
  const noEligibleMachine = prdNo && !resolving && eligibleMachineIds.length === 0
  const entryShift = resolveEntryShiftTimes({ dropdownShiftCode: shiftCode, shifts })

  // Footer totals update live while hour rows are typed: every saved hour of
  // the log + unsaved rows (same rule as the "production log totals" view).
  const liveTotals = activeLog
    ? computeLiveLogTotals({ savedHours: logHours, draftRows: draftHourRows, standardQtyPerHour: activeLog.standard_qty_per_hour })
    : null

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader
        title={subItemLabel('production', 'production-data-entry')}
        subtitle="Employee picks the order + machine; the stage resolves itself"
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {/* Grid's date + shift (an earlier date while correcting a rejected shift). */}
        <ShiftDateLine date={entryDate} shiftCode={shiftCode} shifts={shifts} />
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
          <Field label="Machine" required>
            <SearchableSelect
              value={machineId}
              onChange={handleMachineChange}
              disabled={!!activeLog || !prdNo || eligibleMachineIds.length === 0}
              options={eligibleMachineIds.map((id) => ({
                value: id,
                label: `${optionLabel(id)}${id === nextStageMachineId ? ' (next stage)' : ''}`,
              }))}
            />
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
                <strong data-testid="running-banner" className="block text-[14px] text-[#0B2A5B]">
                  {runningBanner({ stage: resolvedStage, machineLabel: actualMachineText(activeLog.machine_id) })}
                </strong>
                Log open: PRD <strong>{activeLog.prd_no}</strong> · {stageLabel(resolvedStage)} · Machine{' '}
                <strong>{machineLabels[activeLog.machine_id] ?? activeLog.machine_id}</strong> · started{' '}
                {activeLog.start_time ? new Date(activeLog.start_time).toLocaleString() : '—'}. PRD, Stage and Machine
                are locked until you End Log or Mark Stage Complete.
              </span>
            </p>
          )}
          {noEligibleMachine && (
            <p className="text-sm text-amber-600 sm:col-span-3">
              No machine is currently set up to perform the operation this production order needs next.
            </p>
          )}
          {/* Only while choosing a stage -- once a log is open the stage is locked. */}
          {!activeLog && stageChoicesForPrd.length > 1 && (
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
              {cycleNote && !activeLog && <p className="mt-0.5 text-[11px] text-amber-700">{cycleNote}</p>}
            </Field>
            <Field label="Standard Qty / Hour">
              <TextInput value={standardQtyPerHour(resolvedStage.cycle_time_min)?.toFixed(2) ?? ''} disabled />
            </Field>
            {/* While a log is open its stage share is already reserved, so the
                remaining availability reads 0 -- show the log's own planned qty. */}
            <Field label={activeLog ? 'Planned Qty (this log)' : 'Planned Qty (available from upstream)'}>
              <TextInput value={(activeLog ? activeLog.planned_qty : plannedQty) ?? ''} disabled />
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
            {substituteNeeded && (
              <div className="sm:col-span-3 grid grid-cols-1 gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 sm:grid-cols-3" data-testid="substitute-reason">
                <p className="sm:col-span-3 text-[13px] font-medium text-amber-800">
                  Substitute machine: {machineLabels[machineId] ?? machineId} instead of planned {machineLabels[resolvedStage.machine_id] ?? resolvedStage.machine_id} — reason required.
                </p>
                <Field label="Substitute Reason" required>
                  <SelectInput value={substituteReason} onChange={(e) => setSubstituteReason(e.target.value)} options={SUBSTITUTE_REASONS} />
                </Field>
                {substituteReason === 'Other' && (
                  <Field label="Reason (text)" required>
                    <TextInput value={substituteNote} onChange={(e) => setSubstituteNote(e.target.value)} />
                  </Field>
                )}
              </div>
            )}
            {!activeLog && (
              <StageStartGuard
                stage={resolvedStage}
                machineLabel={machineLabels[machineId] ?? machineId}
                available={plannedQty}
                earlierIncomplete={earlierIncomplete}
                confirmed={confirmEarlier}
                onConfirmChange={setConfirmEarlier}
              />
            )}
            <div className="flex items-end">
              <button
                onClick={handleStart}
                disabled={starting || !!activeLog || !!substituteError || !canStartStage({ available: plannedQty, earlierIncomplete, confirmed: confirmEarlier })}
                className="bg-green-600 text-white rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-green-700"
              >
                {activeLog ? 'Started' : starting ? 'Starting...' : 'Start Production'}
              </button>
            </div>
          </FormSection>
        )}

        {activeLog && (
          <FormSection icon={Clock3} title="3. Hourly Entry" subtitle="One row per hour of the selected shift">
            <div className="w-full space-y-2">
              <CorrectingShiftBanner entryDate={entryDate} shiftCode={shiftCode} onBack={() => setEntryDate(todayISO())} />
              <ShiftVerificationStatus verification={shiftCheck.current} appUsers={appUsers} placement="top" />
              <HourlySlotsEntry
                startTime={entryShift.start_time}
                endTime={entryShift.end_time}
                shiftCode={entryShift.shiftCode}
                logHours={logHours}
                employees={employees}
                onSaveHours={handleSaveHours}
                onAddExtraHour={handleAddExtraHour}
                saving={savingHour}
                resetKey={`${activeLog.id}|${entryDate}`}
                entryDate={entryDate}
                readOnly={shiftCheck.locked}
                readOnlyReason={`${decisionText(shiftCheck.current, appUsers)} -- this shift is locked. Only an admin can change it.`}
                shiftStatuses={shiftCheck.statuses}
                onCorrectShift={(date, shift) => {
                  setEntryDate(date)
                  setShiftCode(shift)
                }}
                onDraftRowsChange={setDraftHourRows}
                showIdle
                settingTimeMin={activeLog.setting_time_min}
              />
              {liveTotals && (
                <div className="text-sm text-gray-600 flex flex-wrap gap-x-6 gap-y-1 pt-2 mt-2 border-t border-gray-100">
                  <span>Total Produced: <strong className="num-highlight">{liveTotals.total_produced}</strong></span>
                  <span>Total Rejected: <strong className="num-highlight">{liveTotals.total_rejected ?? 0}</strong></span>
                  <span>Total Rework: <strong className="num-highlight">{liveTotals.total_rework ?? 0}</strong></span>
                  <span>Efficiency: <strong className="num-highlight">{liveTotals.efficiency_pct ?? '—'}%</strong></span>
                  <span>Reject %: <strong className="num-highlight">{liveTotals.reject_pct ?? '—'}%</strong></span>
                  <span>Rework %: <strong className="num-highlight">{liveTotals.rework_pct ?? '—'}%</strong></span>
                </div>
              )}
              <ShiftVerificationStatus verification={shiftCheck.current} appUsers={appUsers} placement="bottom" />
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
