import { useEffect, useState } from 'react'
import { PackageMinus } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, SelectInput, TextInput, AutoFillBox } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import { listPrdsWithRouteCard } from '../../data/queries/qualityLogs'
import { getStagesForPrd } from '../../data/queries/routeCards'
import { listOperators } from '../../data/queries/operators'
import { listShifts } from '../../data/queries/shifts'
import { getCurrentUserId } from '../../data/queries/currentUser'
import { createWipIssue, listWipBalanceForPrd, listWipTransactionsForPrd } from '../../data/queries/wip'

const EMPTY_FORM = { prd_no: '', pool_stage_id: '', target_stage_id: '', qty: '', operator_emp_id: '', shift_code: '', remarks: '' }

export default function WipIssueScreen() {
  const [orders, setOrders] = useState([])
  const [operators, setOperators] = useState([])
  const [shifts, setShifts] = useState([])
  const [stages, setStages] = useState([])
  const [balances, setBalances] = useState([])
  const [transactions, setTransactions] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([listPrdsWithRouteCard(), listOperators(), listShifts()])
      .then(([o, ops, shf]) => {
        setOrders(o)
        setOperators(ops)
        setShifts(shf)
      })
      .catch((e) => setError(e.message))
  }, [])

  async function refresh(prd) {
    const [allStages, bal, txns] = await Promise.all([
      getStagesForPrd(prd),
      listWipBalanceForPrd(prd),
      listWipTransactionsForPrd(prd),
    ])
    setStages(allStages)
    setBalances(bal.map((b) => ({ ...b, operation: allStages.find((s) => s.id === b.nature_of_operation_stage_id)?.operation ?? '' })))
    setTransactions(txns)
  }

  async function handlePrdChange(e) {
    const prd = e.target.value
    setForm((f) => ({ ...EMPTY_FORM, prd_no: prd, operator_emp_id: f.operator_emp_id, shift_code: f.shift_code }))
    setStages([])
    setBalances([])
    setTransactions([])
    if (!prd) return
    try {
      await refresh(prd)
    } catch (e) {
      setError(e.message)
    }
  }

  function handleField(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  const selectedPoolBalance = balances.find((b) => String(b.nature_of_operation_stage_id) === String(form.pool_stage_id))

  async function handleSave() {
    setError(null)
    if (!form.prd_no || !form.pool_stage_id || !form.target_stage_id || !form.qty || Number(form.qty) <= 0 || !form.operator_emp_id || !form.shift_code) {
      setError('Production Order, WIP Pool, Target Stage, Qty, Operator and Shift are all required.')
      return
    }
    setSaving(true)
    try {
      const userId = await getCurrentUserId()
      await createWipIssue({
        prd_no: form.prd_no,
        nature_of_operation_stage_id: Number(form.pool_stage_id),
        target_stage_id: Number(form.target_stage_id),
        qty: Number(form.qty),
        operator_emp_id: form.operator_emp_id,
        shift_code: form.shift_code,
        remarks: form.remarks || null,
        user_id: userId,
      })
      setForm((f) => ({ ...EMPTY_FORM, prd_no: f.prd_no, operator_emp_id: f.operator_emp_id, shift_code: f.shift_code }))
      await refresh(form.prd_no)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="WIP Issue" subtitle="Release Held Work-In-Progress Into Any Stage" />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>
        )}

        <FormSection icon={PackageMinus} title="Issue Details" columns={3}>
          <Field label="Production Order (PRD No)" required>
            <SelectInput value={form.prd_no} onChange={handlePrdChange} options={orders.map((o) => o.prd_no)} />
          </Field>
          <Field label="WIP Pool (Completion Point)" required>
            <SelectInput
              value={form.pool_stage_id}
              onChange={handleField('pool_stage_id')}
              disabled={!form.prd_no}
              options={balances
                .filter((b) => b.current_stock > 0)
                .map((b) => ({
                  value: b.nature_of_operation_stage_id,
                  label: `${b.operation} (balance: ${b.current_stock})`,
                }))}
            />
          </Field>
          <Field label="Available Balance">
            <AutoFillBox value={selectedPoolBalance?.current_stock ?? ''} />
          </Field>
          {/* Target stage is deliberately ANY stage on this PRD's route card, not
              just "the next one" -- WIP is meant to feed whichever stage needs it. */}
          <Field label="Target Stage" required>
            <SelectInput
              value={form.target_stage_id}
              onChange={handleField('target_stage_id')}
              disabled={!form.prd_no}
              options={stages
                .filter((s) => s.type !== 'Manual')
                .sort((a, b) => a.seq - b.seq)
                .map((s) => ({ value: s.id, label: `Seq ${s.seq} - ${s.operation}` }))}
            />
          </Field>
          <Field label="Qty" required>
            <TextInput type="number" value={form.qty} onChange={handleField('qty')} />
          </Field>
          <Field label="Operator" required>
            <SelectInput
              value={form.operator_emp_id}
              onChange={handleField('operator_emp_id')}
              options={operators.map((o) => ({ value: o.operator_emp_id, label: o.operator_name }))}
            />
          </Field>
          <Field label="Shift" required>
            <SelectInput
              value={form.shift_code}
              onChange={handleField('shift_code')}
              options={shifts.map((s) => ({ value: s.shift_code, label: s.shift_name }))}
            />
          </Field>
          <Field label="Remarks">
            <TextInput value={form.remarks} onChange={handleField('remarks')} />
          </Field>
          <div className="flex items-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-green-600 text-white rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-green-700"
            >
              {saving ? 'Saving...' : 'Issue From WIP'}
            </button>
          </div>
        </FormSection>

        {form.prd_no && (
          <RecordsList
            title={`WIP Balance -- ${form.prd_no}`}
            columns={[
              { key: 'operation', label: 'Completion Point' },
              { key: 'current_stock', label: 'Current Stock' },
            ]}
            rows={balances}
            rowKey="nature_of_operation_stage_id"
          />
        )}

        {form.prd_no && (
          <RecordsList
            title={`WIP Transaction History -- ${form.prd_no}`}
            columns={[
              { key: 'transaction_type', label: 'Type' },
              { key: 'nature_of_operation_stage_id', label: 'From Stage ID' },
              { key: 'target_stage_id', label: 'To Stage ID' },
              { key: 'qty', label: 'Qty' },
              { key: 'transaction_date', label: 'Date' },
            ]}
            rows={transactions}
            rowKey="id"
          />
        )}
      </div>
    </div>
  )
}
