import { useEffect, useState } from 'react'
import { PackagePlus } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, SelectInput, TextInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import { listPrdsWithRouteCard } from '../../data/queries/qualityLogs'
import { getStagesForPrd } from '../../data/queries/routeCards'
import { listUsers } from '../../data/queries/users'
import { listShifts } from '../../data/queries/shifts'
import { getCurrentUserId } from '../../data/queries/currentUser'
import { createWipReceipt, listWipBalanceForPrd, listWipTransactionsForPrd } from '../../data/queries/wip'

const EMPTY_FORM = { prd_no: '', stage_id: '', qty: '', user_emp_id: '', shift_code: '', remarks: '' }

export default function WipReceiptScreen() {
  const [orders, setOrders] = useState([])
  const [users, setUsers] = useState([])
  const [shifts, setShifts] = useState([])
  const [completedStages, setCompletedStages] = useState([])
  const [balances, setBalances] = useState([])
  const [transactions, setTransactions] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([listPrdsWithRouteCard(), listUsers(), listShifts()])
      .then(([o, usrs, shf]) => {
        setOrders(o)
        setUsers(usrs)
        setShifts(shf)
      })
      .catch((e) => setError(e.message))
  }, [])

  async function handlePrdChange(e) {
    const prd = e.target.value
    setForm((f) => ({ ...EMPTY_FORM, prd_no: prd, user_emp_id: f.user_emp_id, shift_code: f.shift_code }))
    setCompletedStages([])
    setBalances([])
    setTransactions([])
    if (!prd) return
    try {
      const [stages, bal, txns] = await Promise.all([
        getStagesForPrd(prd),
        listWipBalanceForPrd(prd),
        listWipTransactionsForPrd(prd),
      ])
      setCompletedStages(stages.filter((s) => s.status === 'Completed' || s.status === 'Received'))
      setBalances(bal.map((b) => ({ ...b, operation: stages.find((s) => s.id === b.nature_of_operation_stage_id)?.operation ?? '' })))
      setTransactions(txns)
    } catch (e) {
      setError(e.message)
    }
  }

  async function refreshBalancesAndHistory(prd) {
    const [stages, bal, txns] = await Promise.all([
      getStagesForPrd(prd),
      listWipBalanceForPrd(prd),
      listWipTransactionsForPrd(prd),
    ])
    setBalances(bal.map((b) => ({ ...b, operation: stages.find((s) => s.id === b.nature_of_operation_stage_id)?.operation ?? '' })))
    setTransactions(txns)
  }

  function handleField(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function handleSave() {
    setError(null)
    if (!form.prd_no || !form.stage_id || !form.qty || Number(form.qty) <= 0 || !form.user_emp_id || !form.shift_code) {
      setError('Production Order, Completed Stage, Qty, User and Shift are all required.')
      return
    }
    setSaving(true)
    try {
      const userId = await getCurrentUserId()
      await createWipReceipt({
        prd_no: form.prd_no,
        nature_of_operation_stage_id: Number(form.stage_id),
        qty: Number(form.qty),
        user_emp_id: form.user_emp_id,
        shift_code: form.shift_code,
        remarks: form.remarks || null,
        user_id: userId,
      })
      setForm((f) => ({ ...EMPTY_FORM, prd_no: f.prd_no, user_emp_id: f.user_emp_id, shift_code: f.shift_code }))
      await refreshBalancesAndHistory(form.prd_no)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="WIP Receipt" subtitle="Log Completed Output Into Work-In-Progress Holding" />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>
        )}

        <FormSection icon={PackagePlus} title="Receipt Details" subtitle="Hold a completed stage's output" columns={3}>
          <Field label="Production Order (PRD No)" required>
            <SelectInput value={form.prd_no} onChange={handlePrdChange} options={orders.map((o) => o.prd_no)} />
          </Field>
          <Field label="Completed Stage" required>
            <SelectInput
              value={form.stage_id}
              onChange={handleField('stage_id')}
              disabled={!form.prd_no}
              options={completedStages.map((s) => ({ value: s.id, label: `Seq ${s.seq} - ${s.operation}` }))}
            />
          </Field>
          <Field label="Qty" required>
            <TextInput type="number" value={form.qty} onChange={handleField('qty')} />
          </Field>
          <Field label="User" required>
            <SelectInput
              value={form.user_emp_id}
              onChange={handleField('user_emp_id')}
              options={users.map((o) => ({ value: o.user_emp_id, label: o.user_name }))}
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
              {saving ? 'Saving...' : 'Receive Into WIP'}
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
