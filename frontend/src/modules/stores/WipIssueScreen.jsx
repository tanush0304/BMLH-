import { useEffect, useRef, useState } from 'react'
import { PackageMinus } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, SelectInput, TextInput, AutoFillBox } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import ActionToolbar from '../../components/ActionToolbar'
import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import { listPrdsWithRouteCard } from '../../data/queries/qualityLogs'
import { getStagesForPrd } from '../../data/queries/routeCards'
import { listEmployees } from '../../data/queries/employees'
import { listShifts } from '../../data/queries/shifts'
import { getCurrentUserId } from '../../data/queries/currentUser'
import { createWipIssue, listWipBalanceForPrd, listWipTransactionsForPrd } from '../../data/queries/wip'
import { validateWipIssueQuantity, validateWipIssueStages } from '../../utils/wipValidation'
import EmployeeSelect from '../../components/EmployeeSelect'

const HISTORY_COLUMNS = [
  { key: 'transaction_type', label: 'Type' },
  { key: 'nature_of_operation_stage_id', label: 'From Stage ID' },
  { key: 'target_stage_id', label: 'To Stage ID' },
  { key: 'qty', label: 'Qty' },
  { key: 'transaction_date', label: 'Date' },
]

const EMPTY_FORM = { prd_no: '', pool_stage_id: '', target_stage_id: '', qty: '', employee_id: '', shift_code: '', remarks: '' }

export default function WipIssueScreen() {
  const [orders, setOrders] = useState([])
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [stages, setStages] = useState([])
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

  async function refresh(prd) {
    const requestId = ++prdRequestRef.current
    const [allStages, bal, txns] = await Promise.all([
      getStagesForPrd(prd),
      listWipBalanceForPrd(prd),
      listWipTransactionsForPrd(prd),
    ])
    if (requestId !== prdRequestRef.current) return
    setStages(allStages.filter((stage) => String(stage.prd_no) === String(prd)))
    setBalances(
      bal
        .filter((b) => String(b.prd_no) === String(prd))
        .map((b) => ({
          ...b,
          operation: allStages.find((s) => String(s.id) === String(b.nature_of_operation_stage_id))?.operation ?? '',
        }))
    )
    setTransactions(txns)
  }

  async function handlePrdChange(e) {
    const prd = e.target.value
    selectedPrdRef.current = prd
    prdRequestRef.current += 1
    setForm((f) => ({ ...EMPTY_FORM, prd_no: prd, employee_id: f.employee_id, shift_code: f.shift_code }))
    setStages([])
    setBalances([])
    setTransactions([])
    setError(null)
    if (!prd) return
    try {
      await refresh(prd)
    } catch (e) {
      if (selectedPrdRef.current === prd) setError(e.message)
    }
  }

  function handleField(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  const selectedPoolBalance = balances.find(
    (b) => String(b.prd_no) === String(form.prd_no) && String(b.nature_of_operation_stage_id) === String(form.pool_stage_id)
  )

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
    const stageValidation = validateWipIssueStages(
      form.prd_no,
      form.pool_stage_id,
      form.target_stage_id,
      stages
    )
    if (stageValidation.error) {
      setError(stageValidation.error)
      return
    }
    if (!selectedPoolBalance || String(selectedPoolBalance.prd_no) !== String(form.prd_no)) {
      setError('Select a source WIP stage with available balance for this Production Order.')
      return
    }
    const quantityValidation = validateWipIssueQuantity(form.qty, selectedPoolBalance.current_stock)
    if (quantityValidation.error) {
      setError(quantityValidation.error)
      return
    }
    if (!form.employee_id || !form.shift_code) {
      setError('Select an Employee and Shift.')
      return
    }
    const issuePrd = form.prd_no
    setSaving(true)
    try {
      const userId = await getCurrentUserId()
      await createWipIssue({
        prd_no: form.prd_no,
        nature_of_operation_stage_id: Number(stageValidation.sourceStage.id),
        target_stage_id: Number(stageValidation.targetStage.id),
        qty: quantityValidation.quantity,
        employee_id: form.employee_id,
        shift_code: form.shift_code,
        remarks: form.remarks || null,
        user_id: userId,
      })
      if (selectedPrdRef.current === issuePrd) {
        setForm((f) => ({ ...EMPTY_FORM, prd_no: f.prd_no, employee_id: f.employee_id, shift_code: f.shift_code }))
        await refresh(issuePrd)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="WIP Issue" subtitle="Release Held Work-In-Progress Into Any Stage" />
      {/* Stock ledger: no Edit / Delete -- corrections are a new entry with remarks.
          New / Clear reuse the PRD change path with no PRD, which resets the
          form and its stale-fetch guard (Employee and Shift are kept). */}
      <ActionToolbar
        showEditDelete={false}
        onNew={() => handlePrdChange({ target: { value: '' } })}
        onSave={handleSave}
        onClear={() => handlePrdChange({ target: { value: '' } })}
        saving={saving}
        saveLabel="Issue From WIP"
        showExport={Boolean(form.prd_no)}
        onExportExcel={() => exportToCsv(HISTORY_COLUMNS, transactions, `wip_issues_${form.prd_no}.csv`)}
        onExportPdf={() => exportToPdf(HISTORY_COLUMNS, transactions, `WIP Transaction History -- ${form.prd_no}`, `wip_issues_${form.prd_no}`)}
      />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>
        )}

        <FormSection icon={PackageMinus} title="Issue Details" subtitle="Release WIP into a stage" columns={3}>
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
