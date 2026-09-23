import { useEffect, useState } from 'react'
import { Factory, PlayCircle, Clock3 } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import { listMachines } from '../../data/queries/machines'
import { listOperators } from '../../data/queries/operators'
import { listShifts } from '../../data/queries/shifts'
import { listCustomerOrders } from '../../data/queries/customerOrders'
import { getStagesForPrd } from '../../data/queries/routeCards'
import { listEligibleStagesForMachine } from '../../data/queries/machineEntry'
import {
  getStageAggregatesForPrd,
  createProductionLog,
  addProductionLogHour,
  getLogTotals,
} from '../../data/queries/productionLogs'
import { computeStageAvailability, standardQtyPerHour } from '../../utils/calculations'

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
  const [eligibleStages, setEligibleStages] = useState([]) // one per eligible PRD
  const [resolving, setResolving] = useState(false)

  const [prdNo, setPrdNo] = useState('')
  const [resolvedStage, setResolvedStage] = useState(null)
  const [plannedQty, setPlannedQty] = useState(null)

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

  async function handlePrdChange(e) {
    const prd = e.target.value
    setPrdNo(prd)
    setResolvedStage(null)
    setPlannedQty(null)
    setActiveLog(null)
    if (!prd) return
    const stage = eligibleStages.find((s) => s.prd_no === prd)
    setResolvedStage(stage)
    if (!stage) return
    setResolving(true)
    setError(null)
    try {
      const [order, allStages, aggregates] = await Promise.all([
        listCustomerOrders().then((orders) => orders.find((o) => o.prd_no === prd)),
        getStagesForPrd(prd),
        getStageAggregatesForPrd(prd),
      ])
      const availability = computeStageAvailability(allStages, order?.order_qty ?? 0, aggregates)
      setPlannedQty(availability[stage.id] ?? 0)
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
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingHour(false)
    }
  }

  const noEligiblePrd = machineId && !resolving && eligibleStages.length === 0

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader
        title="Machine Entry"
        subtitle="Operator picks the machine + order; the stage resolves itself"
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#F5F7FA]">
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
              options={eligibleStages.map((s) => s.prd_no)}
            />
          </Field>
          <div className="flex items-end text-sm text-gray-400">
            {resolving && 'Resolving...'}
          </div>
          {noEligiblePrd && (
            <p className="text-sm text-amber-600 sm:col-span-3">
              This machine has no eligible pending stage on any production order right now.
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
                disabled={starting || !!activeLog}
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
      </div>
    </div>
  )
}
