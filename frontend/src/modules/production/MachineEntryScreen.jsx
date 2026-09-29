import { useEffect, useState } from 'react'
import { Factory, PlayCircle, Clock3, CheckCircle2 } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import { listMachines } from '../../data/queries/machines'
import { listOperators } from '../../data/queries/operators'
import { listShifts } from '../../data/queries/shifts'
import { listCustomerOrders } from '../../data/queries/customerOrders'
import { getStagesForPrd, updateStageStatus } from '../../data/queries/routeCards'
import { listEligibleStagesForMachine } from '../../data/queries/machineEntry'
import { getWipAggregatesForPrd } from '../../data/queries/wip'
import {
  getStageAggregatesForPrd,
  createProductionLog,
  addProductionLogHour,
  getLogTotals,
  getOpenLogForStage,
  listLogHoursForLogIds,
} from '../../data/queries/productionLogs'
import {
  computeStageAvailability,
  computeStageUpstreamTargets,
  standardQtyPerHour,
} from '../../utils/calculations'

const HOUR_COLUMNS = [
  { key: 'hour_slot', label: 'Hour' },
  { key: 'qty_produced', label: 'Produced' },
  { key: 'qty_rejected', label: 'Rejected' },
  { key: 'qty_rework', label: 'Rework' },
]

export default function MachineEntryScreen() {
  const [machines, setMachines] = useState([])
  const [operators, setOperators] = useState([])
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [machineId, setMachineId] = useState('')
  const [eligibleStages, setEligibleStages] = useState([]) // every eligible stage, possibly several per PRD
  const [resolving, setResolving] = useState(false)

  const [prdNo, setPrdNo] = useState('')
  const [stageChoiceId, setStageChoiceId] = useState('') // chosen when a PRD has more than one eligible stage
  const [resolvedStage, setResolvedStage] = useState(null)
  const [plannedQty, setPlannedQty] = useState(null)
  const [stageTarget, setStageTarget] = useState(null)
  const [stageOutputSoFar, setStageOutputSoFar] = useState(0)
  const [completing, setCompleting] = useState(false)

  const [operatorId, setOperatorId] = useState('')
  const [shiftCode, setShiftCode] = useState('')

  const [starting, setStarting] = useState(false)
  const [activeLog, setActiveLog] = useState(null)
  const [logHours, setLogHours] = useState([])
  const [totals, setTotals] = useState(null)
  const [hourForm, setHourForm] = useState({ qty_produced: '', qty_rejected: '', qty_rework: '' })
  const [savingHour, setSavingHour] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [machs, ops, shf] = await Promise.all([listMachines(), listOperators(), listShifts()])
        setMachines(machs)
        setOperators(ops)
        setShifts(shf)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleMachineChange(e) {
    const id = e.target.value
    setMachineId(id)
    setPrdNo('')
    setResolvedStage(null)
    setPlannedQty(null)
    setActiveLog(null)
    setEligibleStages([])
    if (!id) return
    setResolving(true)
    setError(null)
    try {
      setEligibleStages(await listEligibleStagesForMachine(id))
    } catch (e) {
      setError(e.message)
    } finally {
      setResolving(false)
    }
  }

  // Stages eligible for the currently-selected PRD on this machine -- more
  // than one is now a real, expected case (WIP can feed any stage), not an
  // edge case to collapse silently.
  const stageChoicesForPrd = prdNo ? eligibleStages.filter((s) => s.prd_no === prdNo) : []

  function handlePrdChange(e) {
    const prd = e.target.value
    setPrdNo(prd)
    setStageChoiceId('')
    setResolvedStage(null)
    setPlannedQty(null)
    setStageTarget(null)
    setStageOutputSoFar(0)
    setActiveLog(null)
    if (!prd) return
    const choices = eligibleStages.filter((s) => s.prd_no === prd)
    if (choices.length === 1) {
      resolveStage(prd, choices[0])
    }
    // If there's more than one, wait for the operator to pick via
    // handleStageChoice below -- don't guess which one they mean.
  }

  function handleStageChoice(e) {
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
    if (!machineId || !prdNo || !resolvedStage || !operatorId || !shiftCode) {
      setError('Machine, PRD, Operator and Shift are all required to start.')
      return
    }
    setStarting(true)
    setError(null)
    try {
      const log = await createProductionLog({
        prd_no: prdNo,
        stage_id: resolvedStage.id,
        machine_id: machineId,
        operator_emp_id: operatorId,
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

  async function handleAddHour() {
    if (!activeLog) return
    setSavingHour(true)
    setError(null)
    try {
      const nextSlot = logHours.length + 1
      const row = await addProductionLogHour({
        log_id: activeLog.id,
        hour_slot: nextSlot,
        qty_produced: hourForm.qty_produced === '' ? 0 : Number(hourForm.qty_produced),
        qty_rejected: hourForm.qty_rejected === '' ? 0 : Number(hourForm.qty_rejected),
        qty_rework: hourForm.qty_rework === '' ? 0 : Number(hourForm.qty_rework),
      })
      setLogHours((h) => [...h, row])
      setHourForm({ qty_produced: '', qty_rejected: '', qty_rework: '' })
      setTotals(await getLogTotals(activeLog.id))

      // Refresh the stage's cumulative actual output so we can auto-suggest
      // completion once it catches up to the upstream target -- never flips
      // status on its own, just surfaces the "Mark Complete" option.
      const aggregates = await getStageAggregatesForPrd(prdNo)
      setStageOutputSoFar(aggregates[resolvedStage.id]?.output ?? 0)
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
      // Stage is done -- clear the resolved state and refresh which PRDs
      // are still eligible on this machine (the next stage, if Internal and
      // on this machine, will now show up).
      setPrdNo('')
      setStageChoiceId('')
      setResolvedStage(null)
      setPlannedQty(null)
      setStageTarget(null)
      setStageOutputSoFar(0)
      setActiveLog(null)
      setLogHours([])
      setTotals(null)
      setEligibleStages(await listEligibleStagesForMachine(machineId))
    } catch (e) {
      setError(e.message)
    } finally {
      setCompleting(false)
    }
  }

  const noEligiblePrd = machineId && !resolving && eligibleStages.length === 0

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader
        title="Machine Entry"
        subtitle="Operator picks the machine + order; the stage resolves itself"
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}

        <FormSection icon={Factory} title="1. Select Machine & Order" columns={3}>
          <Field label="Machine" required>
            <SelectInput value={machineId} onChange={handleMachineChange} options={machines.map((m) => m.machine_id)} />
          </Field>
          <Field label="Production Order (PRD No)" required>
            <SelectInput
              value={prdNo}
              onChange={handlePrdChange}
              disabled={!machineId || eligibleStages.length === 0}
              options={[...new Set(eligibleStages.map((s) => s.prd_no))]}
            />
          </Field>
          {stageChoicesForPrd.length > 1 ? (
            <Field label="Which Stage?" required>
              <SelectInput
                value={stageChoiceId}
                onChange={handleStageChoice}
                options={stageChoicesForPrd.map((s) => ({ value: s.id, label: `Seq ${s.seq} - ${s.operation}` }))}
              />
            </Field>
          ) : (
            <div className="flex items-end text-sm text-gray-400">
              {resolving && 'Resolving...'}
            </div>
          )}
          {noEligiblePrd && (
            <p className="text-sm text-amber-600 sm:col-span-3">
              This machine has no eligible pending stage on any production order right now.
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
          <FormSection icon={PlayCircle} title="2. Auto-Resolved Stage" columns={3}>
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
            <Field label="Operator" required>
              <SelectInput
                value={operatorId}
                onChange={(e) => setOperatorId(e.target.value)}
                options={operators.map((o) => o.operator_emp_id)}
              />
            </Field>
            <Field label="Shift" required>
              <SelectInput
                value={shiftCode}
                onChange={(e) => setShiftCode(e.target.value)}
                options={shifts.map((s) => s.shift_code)}
              />
            </Field>
            <div className="flex items-end">
              <button
                onClick={handleStart}
                disabled={starting || !!activeLog || !plannedQty}
                className="bg-green-600 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-green-700"
              >
                {activeLog ? 'Started' : starting ? 'Starting...' : 'Start Production'}
              </button>
            </div>
          </FormSection>
        )}

        {activeLog && (
          <FormSection icon={Clock3} title="3. Hourly Entry" columns={4}>
            <Field label="Qty Produced">
              <TextInput
                type="number"
                value={hourForm.qty_produced}
                onChange={(e) => setHourForm((f) => ({ ...f, qty_produced: e.target.value }))}
              />
            </Field>
            <Field label="Qty Rejected">
              <TextInput
                type="number"
                value={hourForm.qty_rejected}
                onChange={(e) => setHourForm((f) => ({ ...f, qty_rejected: e.target.value }))}
              />
            </Field>
            <Field label="Qty Rework">
              <TextInput
                type="number"
                value={hourForm.qty_rework}
                onChange={(e) => setHourForm((f) => ({ ...f, qty_rework: e.target.value }))}
              />
            </Field>
            <div className="flex items-end">
              <button
                onClick={handleAddHour}
                disabled={savingHour || logHours.length >= 12}
                className="bg-bmlhblue text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-40"
              >
                Add Hour {logHours.length + 1}
              </button>
            </div>
            {totals && (
              <div className="sm:col-span-4 text-sm text-gray-600 flex gap-6 pt-2 border-t border-gray-100 mt-2">
                <span>Total Produced: <strong>{totals.total_produced}</strong></span>
                <span>Efficiency: <strong>{totals.efficiency_pct ?? '—'}%</strong></span>
                <span>Reject %: <strong>{totals.reject_pct ?? '—'}%</strong></span>
                <span>Rework %: <strong>{totals.rework_pct ?? '—'}%</strong></span>
              </div>
            )}
          </FormSection>
        )}

        {activeLog && (
          <RecordsList title="Hours Logged This Session" columns={HOUR_COLUMNS} rows={logHours} rowKey="id" />
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
