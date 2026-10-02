import { useEffect, useState } from 'react'
import { ClipboardCheck, PlayCircle, Clock3, CheckCircle2 } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import { listUsers } from '../../data/queries/users'
import { listShifts } from '../../data/queries/shifts'
import { listCustomerOrders } from '../../data/queries/customerOrders'
import { getStagesForPrd, updateStageStatus, listAllStages } from '../../data/queries/routeCards'
import { getWipAggregatesForPrd } from '../../data/queries/wip'
import {
  getStageAggregatesForPrd,
  createProductionLog,
  addProductionLogHour,
  getLogTotals,
  getOpenLogForStage,
  listLogHoursForLogIds,
  closeProductionLog,
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

/**
 * Manual-type stages (De-Burring, Final Inspection, Final Dispatch, ...)
 * have no machine and no job work code -- this reuses the exact same
 * production_logs / production_log_hours tables and is_open lock Machine
 * Entry uses for Internal stages, just without a machine-selection step.
 */
export default function ManualOperationsScreen() {
  const [users, setUsers] = useState([])
  const [shifts, setShifts] = useState([])
  const [pendingStages, setPendingStages] = useState([]) // every Pending/Manual stage, any PRD
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [userId, setUserId] = useState('')
  const [shiftCode, setShiftCode] = useState('')

  const [prdNo, setPrdNo] = useState('')
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
  const [hourForm, setHourForm] = useState({ qty_produced: '', qty_rejected: '', qty_rework: '' })
  const [savingHour, setSavingHour] = useState(false)

  async function loadPendingStages() {
    const allStages = await listAllStages()
    setPendingStages(allStages.filter((s) => s.type === 'Manual' && s.status === 'Pending'))
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [usrs, shf] = await Promise.all([listUsers(), listShifts()])
        setUsers(usrs)
        setShifts(shf)
        await loadPendingStages()
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
  // meant rather than guessing, same as Machine Entry does for multiple
  // eligible stages on one machine.
  const stageChoicesForPrd = prdNo ? pendingStages.filter((s) => s.prd_no === prdNo) : []

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
    const choices = pendingStages.filter((s) => s.prd_no === prd)
    if (choices.length === 1) {
      resolveStage(prd, choices[0])
    }
    // If there's more than one, wait for the user to pick via
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
    if (!prdNo || !resolvedStage || !userId || !shiftCode) {
      setError('PRD, Stage, User and Shift are all required to start.')
      return
    }
    setStarting(true)
    setError(null)
    try {
      const log = await createProductionLog({
        prd_no: prdNo,
        stage_id: resolvedStage.id,
        machine_id: null,
        user_emp_id: userId,
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
      if (activeLog) await closeProductionLog(activeLog.id)
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
    } catch (e) {
      setError(e.message)
    } finally {
      setCompleting(false)
    }
  }

  const noEligibleStage = prdNo && !resolving && stageChoicesForPrd.length === 0

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

        <FormSection icon={ClipboardCheck} title="1. Select User & Order" subtitle="Pick who, then order" columns={3}>
          <Field label="User" required>
            <SelectInput value={userId} onChange={(e) => setUserId(e.target.value)} options={users.map((o) => o.user_emp_id)} />
          </Field>
          <Field label="Production Order (PRD No)" required>
            <SelectInput
              value={prdNo}
              onChange={handlePrdChange}
              options={[...new Set(pendingStages.map((s) => s.prd_no))]}
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
          <FormSection icon={Clock3} title="3. Hourly Entry" subtitle="Log output for this hour" columns={4}>
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
                className="bg-bmlhblue text-white rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40"
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
