import { useEffect, useState } from 'react'
import { Boxes, PackagePlus } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, TextInput, SelectInput, AutoFillBox } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import { productOptions } from '../../utils/productOptions'
import RecordsList from '../../components/RecordsList'
import ActionToolbar from '../../components/ActionToolbar'
import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import { listRawMaterials } from '../../data/queries/rawMaterials'
import { listProducts } from '../../data/queries/products'
import { listEmployees } from '../../data/queries/employees'
import { listShifts } from '../../data/queries/shifts'
import { listSuppliers } from '../../data/queries/suppliers'
import { getCurrentUserId } from '../../data/queries/currentUser'
import {
  listRawMaterialStockBalance,
  listRawMaterialTransactions,
  createRawMaterialTransaction,
  updateRawMaterialTransaction,
} from '../../data/queries/rawMaterialStock'
import { todayISO } from '../../utils/dates'
import { listAllProductRawMaterials } from '../../data/queries/productRawMaterials'
import { unitsProducible, validateRmIssueQuantity } from '../../utils/rmStock'
import EmployeeSelect from '../../components/EmployeeSelect'
import StockEditPanel, { useAppUsers, withEditedLabels, EDITED_COLUMN } from '../../components/StockEditPanel'
import { canEditStock, stockEditPatch, validateRmIssueEdit, validateReceiptEdit } from '../../utils/stockEdit'

const EMPTY_ISSUE_FORM = {
  employee_id: '',
  shift_code: '',
  raw_material_code: '',
  part_serial_number: '',
  qty: '',
  transaction_date: todayISO(),
}

const EMPTY_RECEIPT_FORM = {
  employee_id: '',
  shift_code: '',
  raw_material_code: '',
  supplier_id: '',
  qty: '',
  transaction_date: todayISO(),
}

const ISSUE_COLUMNS = [
  { key: 'doc_no', label: 'Issue No' },
  { key: 'transaction_date', label: 'Issue Date' },
  { key: 'employee_id', label: 'Employee ID' },
  { key: 'employee_name', label: 'Employee Name' },
  { key: 'shift_code', label: 'Shift' },
  { key: 'material_name', label: 'RM / Consumable Name' },
  { key: 'part_serial_number', label: 'Part Serial Number' },
  { key: 'current_stock', label: 'Current Stock (Nos)' },
  { key: 'qty', label: 'Qty Issued (Nos)' },
  { key: 'units_producible', label: 'No. of Units Can be Produced' },
]

const RECEIPT_COLUMNS = [
  { key: 'doc_no', label: 'Receipt No' },
  { key: 'transaction_date', label: 'Receipt Date' },
  { key: 'employee_id', label: 'Employee ID' },
  { key: 'employee_name', label: 'Employee Name' },
  { key: 'shift_code', label: 'Shift' },
  { key: 'material_name', label: 'RM / Consumable Name' },
  { key: 'supplier_id', label: 'Supplier' },
  { key: 'qty', label: 'Qty Received (Nos)' },
  { key: 'current_stock', label: 'Current Stock (Nos)' },
]

export default function RawMaterialStoreScreen({ initialMode = 'issue', role }) {
  const [mode, setMode] = useState(initialMode) // 'issue' | 'receipt'
  const [rawMaterials, setRawMaterials] = useState([])
  const [products, setProducts] = useState([])
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [balances, setBalances] = useState([])
  const [bomRows, setBomRows] = useState([])
  const [transactions, setTransactions] = useState([])
  const [currentUserId, setCurrentUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [issueForm, setIssueForm] = useState(EMPTY_ISSUE_FORM)
  const [receiptForm, setReceiptForm] = useState(EMPTY_RECEIPT_FORM)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  // doc_no is assigned by the DB trigger (migration 022); shown after save.
  const [savedDocNo, setSavedDocNo] = useState({ issue: '', receipt: '' })
  // Supervisor/admin edit of an existing row (Delete stays hidden).
  const appUsers = useAppUsers()
  const [selectedRow, setSelectedRow] = useState(null)
  const [editingRow, setEditingRow] = useState(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [rms, prods, employeeRows, shf, sups, bal, txns, userId, bom] = await Promise.all([
        listRawMaterials(),
        listProducts(),
        listEmployees(),
        listShifts(),
        listSuppliers(),
        listRawMaterialStockBalance(),
        listRawMaterialTransactions(),
        getCurrentUserId(),
        listAllProductRawMaterials(),
      ])
      setRawMaterials(rms)
      setProducts(prods)
      setEmployees(employeeRows)
      setShifts(shf)
      setSuppliers(sups)
      setBalances(bal)
      setBomRows(bom)
      setTransactions(txns)
      setCurrentUserId(userId)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  function employeeName(id) {
    return employees.find((o) => o.employee_id === id)?.employee_name ?? ''
  }

  function materialName(code) {
    return rawMaterials.find((r) => r.raw_material_code === code)?.raw_material_name ?? code
  }

  function currentStockFor(code) {
    return balances.find((b) => b.raw_material_code === code)?.current_stock ?? ''
  }

  // Closing stock (opening + receipts - issues) / consumption for the part +
  // raw material; text when the pair has no BOM row.
  function unitsProducibleFor(partSerialNumber, rawMaterialCode) {
    if (!partSerialNumber || !rawMaterialCode) return ''
    const units = unitsProducible(currentStockFor(rawMaterialCode), bomRows, partSerialNumber, rawMaterialCode)
    return units === null ? 'No BOM for this part' : units
  }

  function handleReset() {
    setIssueForm(EMPTY_ISSUE_FORM)
    setReceiptForm(EMPTY_RECEIPT_FORM)
    setSavedDocNo({ issue: '', receipt: '' })
    setSelectedRow(null)
    setEditingRow(null)
    setError(null)
  }

  // Re-checks stock with this row taken out first (same rules as a new
  // entry), then saves only qty / date / remarks (+ supplier on receipts).
  async function handleSaveEdit(draft) {
    const row = editingRow
    if (!draft.transaction_date) return 'Date is required.'
    const closing = currentStockFor(row.raw_material_code)
    const isIssue = row.transaction_type === 'Issue'
    const problem = isIssue
      ? validateRmIssueEdit(draft.qty, row.qty, closing)
      : validateReceiptEdit(draft.qty, row.qty, closing)
    if (problem) return problem
    await updateRawMaterialTransaction(row.id, stockEditPatch(draft, { withSupplier: !isIssue }))
    setEditingRow(null)
    setSelectedRow(null)
    await refresh()
    return null
  }

  function handleIssueField(key) {
    return (e) => setIssueForm((f) => ({ ...f, [key]: e.target.value }))
  }

  function handleReceiptField(key) {
    return (e) => setReceiptForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function handleSaveIssue() {
    const f = issueForm
    if (!f.employee_id || !f.shift_code || !f.raw_material_code || !f.qty || !f.transaction_date) {
      setError('Employee Name, Shift, Raw Material / Consumable, Quantity Issued and Issue Date are all required.')
      return
    }
    const qtyError = validateRmIssueQuantity(f.qty, currentStockFor(f.raw_material_code))
    if (qtyError) {
      setError(qtyError)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const saved = await createRawMaterialTransaction({
        raw_material_code: f.raw_material_code,
        transaction_type: 'Issue',
        qty: Number(f.qty),
        transaction_date: f.transaction_date,
        part_serial_number: f.part_serial_number || null,
        employee_id: f.employee_id,
        shift_code: f.shift_code,
        user_id: currentUserId,
      })
      handleReset()
      setSavedDocNo({ issue: saved?.doc_no ?? '', receipt: '' })
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveReceipt() {
    const f = receiptForm
    if (!f.employee_id || !f.shift_code || !f.raw_material_code || !f.qty || !f.transaction_date) {
      setError('Employee Name, Shift, Raw Material / Consumable, Quantity Received and Receipt Date are all required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const saved = await createRawMaterialTransaction({
        raw_material_code: f.raw_material_code,
        transaction_type: 'Receipt',
        qty: Number(f.qty),
        transaction_date: f.transaction_date,
        supplier_id: f.supplier_id || null,
        employee_id: f.employee_id,
        shift_code: f.shift_code,
        user_id: currentUserId,
      })
      handleReset()
      setSavedDocNo({ issue: '', receipt: saved?.doc_no ?? '' })
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const issueRows = transactions
    .filter((t) => t.transaction_type === 'Issue')
    .map((t) => ({
      ...t,
      employee_name: employeeName(t.employee_id),
      material_name: materialName(t.raw_material_code),
      current_stock: currentStockFor(t.raw_material_code),
      units_producible: unitsProducibleFor(t.part_serial_number, t.raw_material_code),
    }))

  const receiptRows = transactions
    .filter((t) => t.transaction_type === 'Receipt')
    .map((t) => ({
      ...t,
      employee_name: employeeName(t.employee_id),
      material_name: materialName(t.raw_material_code),
      current_stock: currentStockFor(t.raw_material_code),
    }))

  const activeRows = withEditedLabels(mode === 'issue' ? issueRows : receiptRows, appUsers)
  const filteredRows = activeRows.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      r.doc_no?.toLowerCase().includes(q) ||
      r.transaction_date?.toLowerCase().includes(q) ||
      r.employee_id?.toLowerCase().includes(q) ||
      r.material_name?.toLowerCase().includes(q)
    )
  })

  const activeColumns = [...(mode === 'issue' ? ISSUE_COLUMNS : RECEIPT_COLUMNS), EDITED_COLUMN]
  const listTitle = mode === 'issue' ? 'Raw Material & Consumables Issue List' : 'Raw Material & Consumables Receipt List'
  const exportName = mode === 'issue' ? 'rm_issue' : 'rm_receipt'

  const handleSave = mode === 'issue' ? handleSaveIssue : handleSaveReceipt

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader
        eyebrow="Stores Module"
        title="Raw Material & Consumables"
        subtitle="Right Material  |  Right Quantity  |  Right Production"
      />

      <div className="flex items-center gap-1 bg-white border-b border-gray-200 px-6 pt-2">
        {[
          { key: 'issue', label: 'Issue' },
          { key: 'receipt', label: 'Receipt' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setMode(t.key)
              setSelectedRow(null)
              setEditingRow(null)
              setError(null)
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              mode === t.key
                ? 'border-bmlhnavy text-bmlhnavy'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Stock ledger: no Edit / Delete -- corrections are a new entry with remarks. */}
      <ActionToolbar
        showEditDelete={canEditStock(role)}
        showDelete={false}
        onEdit={() => setEditingRow(selectedRow)}
        canEdit={!!selectedRow && !editingRow}
        onNew={handleReset}
        onSave={handleSave}
        onClear={handleReset}
        saving={saving}
        onExportExcel={() => exportToCsv(activeColumns, filteredRows, `${exportName}.csv`)}
        onExportPdf={() => exportToPdf(activeColumns, filteredRows, listTitle, exportName)}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}

        {mode === 'issue' ? (
          <FormSection icon={Boxes} title="Stores Module - Raw Material & Consumables Issue Details" subtitle="Issue to production" columns={2}>
            <Field label="Issue No">
              <TextInput value={savedDocNo.issue || '(auto-generated on save)'} readOnly />
            </Field>
            <Field label="Employee ID" required>
              <EmployeeSelect employees={employees} value={issueForm.employee_id} onChange={handleIssueField('employee_id')} />
            </Field>
            <Field label="Current Stock">
              <AutoFillBox value={currentStockFor(issueForm.raw_material_code)} unit="Nos" />
            </Field>

            <Field label="Employee Name">
              <AutoFillBox value={employeeName(issueForm.employee_id)} />
            </Field>
            <Field label="Number of units can be produced">
              <AutoFillBox value={unitsProducibleFor(issueForm.part_serial_number, issueForm.raw_material_code)} unit="Nos" />
            </Field>

            <Field label="Shift" required>
              <SelectInput
                value={issueForm.shift_code}
                onChange={handleIssueField('shift_code')}
                options={shifts.map((s) => ({ value: s.shift_code, label: s.shift_name || s.shift_code }))}
              />
            </Field>
            <Field label="Quantity Issued" required>
              <div className="flex rounded overflow-hidden border border-gray-300">
                <input
                  type="number"
                  value={issueForm.qty}
                  onChange={handleIssueField('qty')}
                  placeholder="Enter Quantity"
                  className="flex-1 px-3 py-2 text-sm focus:outline-none"
                />
                <span className="px-3 py-2 text-sm text-gray-500 bg-gray-100 border-l border-gray-300">Nos</span>
              </div>
            </Field>

            <Field label="Raw material / Consumable name" required>
              <SearchableSelect
                value={issueForm.raw_material_code}
                onChange={handleIssueField('raw_material_code')}
                options={rawMaterials.map((r) => ({
                  value: r.raw_material_code,
                  label: r.raw_material_name || r.raw_material_code,
                }))}
              />
            </Field>
            <Field label="Issue Date" required>
              <TextInput type="date" value={issueForm.transaction_date} onChange={handleIssueField('transaction_date')} />
            </Field>

            <Field label="Part Serial Number">
              <SearchableSelect
                value={issueForm.part_serial_number}
                onChange={handleIssueField('part_serial_number')}
                options={productOptions(products)}
              />
            </Field>

            <p className="sm:col-span-2 text-xs text-gray-500 bg-sky-50 border border-sky-100 rounded px-3 py-2">
              "Employee ID" picks who's physically issuing the material (Employee Master); the account you're
              logged in as is recorded automatically. Current Stock auto-fills from the selected material.
            </p>
          </FormSection>
        ) : (
          <FormSection icon={PackagePlus} title="Stores Module - Raw Material & Consumables Receipt Details" subtitle="Receive from supplier" columns={2}>
            <Field label="Receipt No">
              <TextInput value={savedDocNo.receipt || '(auto-generated on save)'} readOnly />
            </Field>
            <Field label="Employee ID" required>
              <EmployeeSelect employees={employees} value={receiptForm.employee_id} onChange={handleReceiptField('employee_id')} />
            </Field>
            <Field label="Current Stock">
              <AutoFillBox value={currentStockFor(receiptForm.raw_material_code)} unit="Nos" />
            </Field>

            <Field label="Employee Name">
              <AutoFillBox value={employeeName(receiptForm.employee_id)} />
            </Field>
            <Field label="Supplier">
              <SearchableSelect
                value={receiptForm.supplier_id}
                onChange={handleReceiptField('supplier_id')}
                options={suppliers.map((s) => ({ value: s.supplier_id, label: s.supplier_name || s.supplier_id }))}
              />
            </Field>

            <Field label="Shift" required>
              <SelectInput
                value={receiptForm.shift_code}
                onChange={handleReceiptField('shift_code')}
                options={shifts.map((s) => ({ value: s.shift_code, label: s.shift_name || s.shift_code }))}
              />
            </Field>
            <Field label="Quantity Received" required>
              <div className="flex rounded overflow-hidden border border-gray-300">
                <input
                  type="number"
                  value={receiptForm.qty}
                  onChange={handleReceiptField('qty')}
                  placeholder="Enter Quantity"
                  className="flex-1 px-3 py-2 text-sm focus:outline-none"
                />
                <span className="px-3 py-2 text-sm text-gray-500 bg-gray-100 border-l border-gray-300">Nos</span>
              </div>
            </Field>

            <Field label="Raw material / Consumable name" required>
              <SearchableSelect
                value={receiptForm.raw_material_code}
                onChange={handleReceiptField('raw_material_code')}
                options={rawMaterials.map((r) => ({
                  value: r.raw_material_code,
                  label: r.raw_material_name || r.raw_material_code,
                }))}
              />
            </Field>
            <Field label="Receipt Date" required>
              <TextInput type="date" value={receiptForm.transaction_date} onChange={handleReceiptField('transaction_date')} />
            </Field>
          </FormSection>
        )}

        {editingRow && (
          <StockEditPanel
            row={editingRow}
            info={[
              { label: editingRow.transaction_type === 'Issue' ? 'Issue No' : 'Receipt No', value: editingRow.doc_no },
              { label: 'Transaction Type', value: editingRow.transaction_type },
              { label: 'Raw Material', value: materialName(editingRow.raw_material_code) },
              ...(editingRow.transaction_type === 'Issue'
                ? [{ label: 'Part Serial Number', value: editingRow.part_serial_number }]
                : []),
            ]}
            qtyLabel={editingRow.transaction_type === 'Issue' ? 'Quantity Issued' : 'Quantity Received'}
            supplierOptions={
              editingRow.transaction_type === 'Receipt'
                ? suppliers.map((s) => ({ value: s.supplier_id, label: s.supplier_name || s.supplier_id }))
                : undefined
            }
            onSave={handleSaveEdit}
            onCancel={() => setEditingRow(null)}
          />
        )}

        <RecordsList
          title={listTitle}
          columns={activeColumns}
          rows={filteredRows}
          loading={loading}
          error={null}
          rowKey="id"
          selectedKey={selectedRow?.id}
          onRowClick={(r) => !editingRow && setSelectedRow(r)}
          searchValue={search}
          onSearchChange={setSearch}
        />
      </div>
    </div>
  )
}
