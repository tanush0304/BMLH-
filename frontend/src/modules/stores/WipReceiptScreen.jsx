import { useEffect, useRef, useState } from 'react'
import { PackagePlus } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, SelectInput, TextInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import ActionToolbar from '../../components/ActionToolbar'
import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import { listPrdsWithRouteCard } from '../../data/queries/qualityLogs'
import { getStagesForPrd } from '../../data/queries/routeCards'
import { listEmployees } from '../../data/queries/employees'
import { listShifts } from '../../data/queries/shifts'
import { getCurrentUserId } from '../../data/queries/currentUser'
import { createWipReceipt, listWipBalanceForPrd, listWipTransactionsForPrd } from '../../data/queries/wip'
import { parsePositiveWipQuantity, validateWipReceiptStage } from '../../utils/wipValidation'
import EmployeeSelect from '../../components/EmployeeSelect'

const HISTORY_COLUMNS = [
  { key: 'transaction_type', label: 'Type' },
  { key: 'nature_of_operation_stage_id', label: 'From Stage ID' },
  { key: 'target_stage_id', label: 'To Stage ID' },
  { key: 'qty', label: 'Qty' },
  { key: 'transaction_date', label: 'Date' },
]

const EMPTY_FORM = { prd_no: '', stage_id: '', qty: '', employee_id: '', shift_code: '', remarks: '' }

export default function WipReceiptScreen() {
  const [orders, setOrders] = useState([])
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [completedStages, setCompletedStages] = useState([])
  const [balances, setBalances] = useState([])
  const [transactions, setTransactions] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const selectedPrdRef = useRef('')
  const prdRequestRef = useRef(0)

  useEffect(() => {
    Promise.all([listPrdsWithRouteCard(), listEmployees(), listShifts()])
      .then(([o, employeeRows, shf]) => {
        setOrders(o)
        setEmployees(employeeRows)
        setShifts(shf)
      })
      .catch((e) => setError(e.message))
  }, [])

  async function handlePrdChange(e) {
    const prd = e.target.value
    const requestId = ++prdRequestRef.current
    selectedPrdRef.current = prd
    setForm((f) => ({ ...EMPTY_FORM, prd_no: prd, employee_id: f.employee_id, shift_code: f.shift_code }))
    setCompletedStages([])
    setBalances([])
    setTransactions([])
    setError(null)
    if (!prd) return
    try {
      const [stages, bal, txns] = await Promise.all([
        getStagesForPrd(prd),
        listWipBalanceForPrd(prd),
        listWipTransactionsForPrd(prd),
      ])
      if (requestId !== prdRequestRef.current) return
      setCompletedStages(stages.filter((s) => s.status === 'Completed' || s.status === 'Received'))
      setBalances(
        bal
          .filter((b) => String(b.prd_no) === String(prd))
          .map((b) => ({
            ...b,
            operation: stages.find((s) => String(s.id) === String(b.nature_of_operation_stage_id))?.operation ?? '',
          }))
      )
      setTransactions(txns)
    } catch (e) {
      if (requestId === prdRequestRef.current) setError(e.message)
    }
  }

  async function refreshBalancesAndHistory(prd) {
    const requestId = ++prdRequestRef.current
    const [stages, bal, txns] = await Promise.all([
      getStagesForPrd(prd),
      listWipBalanceForPrd(prd),
      listWipTransactionsForPrd(prd),
    ])
    if (requestId !== prdRequestRef.current) return
    setCompletedStages(stages.filter((s) => s.status === 'Completed' || s.status === 'Received'))
    setBalances(
      bal
        .filter((b) => String(b.prd_no) === String(prd))
        .map((b) => ({
          ...b,
          operation: stages.find((s) => String(s.id) === String(b.nature_of_operation_stage_id))?.operation ?? '',
        }))
    )
    setTransactions(txns)
  }

  function handleField(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function handleSave() {
    setError(null)
    if (!form.prd_no) {
      setError('Select a Production Order first.')
      return
    }
    if (!orders.some((order) => String(order.prd_no) === String(form.prd_no))) {
      setError('Select a Production Order that has a Route Card.')
      return
    }
    const stageError = validateWipReceiptStage(form.prd_no, form.stage_id, completedStages)
    if (stageError) {
      setError(stageError)
      return
    }
    const quantity = parsePositiveWipQuantity(form.qty)
    if (quantity === null) {
      setError('Qty must be a finite number greater than zero.')
      return
    }
    if (!form.employee_id || !form.shift_code) {
      setError('Select an Employee and Shift.')
      return
    }
    const receiptPrd = form.prd_no
    setSaving(true)
    try {
      const userId = await getCurrentUserId()
      await createWipReceipt({
        prd_no: form.prd_no,
        nature_of_operation_stage_id: Number(form.stage_id),
        qty: quantity,
        employee_id: form.employee_id,
        shift_code: form.shift_code,
        remarks: form.remarks || null,
        user_id: userId,
      })
      if (selectedPrdRef.current === receiptPrd) {
        setForm((f) => ({ ...EMPTY_FORM, prd_no: f.prd_no, employee_id: f.employee_id, shift_code: f.shift_code }))
        await refreshBalancesAndHistory(receiptPrd)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="WIP Receipt" subtitle="Log Completed Output Into Work-In-Progress Holding" />
      {/* Stock ledger: no Edit / Delete -- corrections are a new entry with remarks.
          New / Clear reuse the PRD change path with no PRD, which resets the
          form and its stale-fetch guard (Employee and Shift are kept). */}
      <ActionToolbar
        showEditDelete={false}
        onNew={() => handlePrdChange({ target: { value: '' } })}
        onSave={handleSave}
        onClear={() => handlePrdChange({ target: { value: '' } })}
        saving={saving}
        saveLabel="Receive Into WIP"
        showExport={Boolean(form.prd_no)}
        onExportExcel={() => exportToCsv(HISTORY_COLUMNS, transactions, `wip_receipts_${form.prd_no}.csv`)}
        onExportPdf={() => exportToPdf(HISTORY_COLUMNS, transactions, `WIP Transaction History -- ${form.prd_no}`, `wip_receipts_${form.prd_no}`)}
      />
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
            <TextInput type="number" min="0" step="any" value={form.qty} onChange={handleField('qty')} />
          </Field>
          <Field label="Employee" required>
            <EmployeeSelect employees={employees} value={form.employee_id} onChange={handleField('employee_id')} />
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
            columns={HISTORY_COLUMNS}
            rows={transactions}
            rowKey="id"
          />
        )}
      </div>
    </div>
  )
}
