import { useEffect, useState } from 'react'
import { ClipboardPlus } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, TextInput, AutoFillBox } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import RecordsList from '../../components/RecordsList'
import ActionToolbar from '../../components/ActionToolbar'
import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import { listCustomerOrders } from '../../data/queries/customerOrders'
import { listProductRawMaterials } from '../../data/queries/productRawMaterials'
import { listRawMaterials } from '../../data/queries/rawMaterials'
import { listProducts } from '../../data/queries/products'
import { listEmployees } from '../../data/queries/employees'
import { employeeLabelForId } from '../../utils/employeeLabel'
import EmployeeSelect from '../../components/EmployeeSelect'
import {
  listRequisitions,
  createRequisition,
  listOrderMaterialRequirement,
  generateNextRequisitionNo,
} from '../../data/queries/rawMaterialRequisitions'

const EMPTY_FORM = {
  prd_no: '',
  raw_material_code: '',
  part_name: '',
  part_serial_number: '',
  part_drawing_reference_number: '',
  employee_id: '',
  qty_required: '',
}

export default function RawMaterialRequisitionScreen() {
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [employees, setEmployees] = useState([])
  const [rawMaterials, setRawMaterials] = useState([])
  const [materialRequirement, setMaterialRequirement] = useState([])
  const [requisitions, setRequisitions] = useState([])
  const [bomForProduct, setBomForProduct] = useState([]) // this order's product's own BOM rows
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [ords, prods, employeeRows, rms, reqmt, reqs] = await Promise.all([
        listCustomerOrders(),
        listProducts(),
        listEmployees(),
        listRawMaterials(),
        listOrderMaterialRequirement(),
        listRequisitions(),
      ])
      setOrders(ords)
      setProducts(prods)
      setEmployees(employeeRows)
      setRawMaterials(rms)
      setMaterialRequirement(reqmt)
      setRequisitions(reqs)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const selectedOrder = orders.find((o) => o.prd_no === form.prd_no)

  async function handlePrdChange(e) {
    const prd = e.target.value
    // Changing the order clears everything order-dependent: the raw
    // material pick/qty (the previous PRD's BOM no longer applies) and the
    // part details, which are read-only and always taken from the PRD's
    // part in Product Master below.
    setForm({ ...EMPTY_FORM, prd_no: prd })
    if (!prd) {
      setBomForProduct([])
      return
    }
    const order = orders.find((o) => o.prd_no === prd)
    if (!order?.part_serial_number) {
      setBomForProduct([])
      return
    }
    try {
      setBomForProduct(await listProductRawMaterials(order.part_serial_number))
    } catch (e) {
      setError(e.message)
    }
    const product = products.find((p) => p.part_serial_number === order.part_serial_number)
    setForm((f) => ({
      ...f,
      part_name: product?.part_name ?? '',
      part_serial_number: order.part_serial_number,
      part_drawing_reference_number: product?.part_drawing_reference_number ?? '',
    }))
  }

  function handleMaterialChange(e) {
    const code = e.target.value
    const prefill = materialRequirement.find((r) => r.prd_no === form.prd_no && r.raw_material_code === code)
    setForm((f) => ({ ...f, raw_material_code: code, qty_required: prefill?.total_qty_required ?? f.qty_required }))
  }

  function handleField(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  function handleReset() {
    setForm(EMPTY_FORM)
    setBomForProduct([])
    setError(null)
  }

  async function handleSave() {
    setError(null)
    if (!form.prd_no || !form.raw_material_code || !form.qty_required || Number(form.qty_required) <= 0) {
      setError('Production Order, Raw Material and a Qty Required greater than 0 are all required.')
      return
    }
    setSaving(true)
    try {
      const requisitionNo = await generateNextRequisitionNo()
      await createRequisition({
        requisition_no: requisitionNo,
        prd_no: form.prd_no,
        raw_material_code: form.raw_material_code,
        part_name: form.part_name || null,
        part_serial_number: form.part_serial_number || null,
        part_drawing_reference_number: form.part_drawing_reference_number || null,
        employee_id: form.employee_id || null,
        qty_required: Number(form.qty_required),
      })
      handleReset()
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredRequisitions = requisitions.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.prd_no?.toLowerCase().includes(q) || r.raw_material_code?.toLowerCase().includes(q)
  })

  const listColumns = [
    { key: 'requisition_no', label: 'Requisition No' },
    { key: 'prd_no', label: 'PRD No' },
    { key: 'raw_material_code', label: 'Raw Material' },
    { key: 'part_name', label: 'Part Name' },
    { key: 'part_serial_number', label: 'Part Serial Number' },
    { key: 'part_drawing_reference_number', label: 'Drawing Ref No' },
    { key: 'employee_id', label: 'Requested By', render: (r) => employeeLabelForId(r.employee_id, employees) },
    { key: 'qty_required', label: 'Qty Required' },
    { key: 'order_date', label: 'Order Date' },
    { key: 'status', label: 'Status', type: 'status' },
  ]

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Raw Material Requisition" subtitle="Request Material Against a Production Order" />
      <ActionToolbar
        showEditDelete={false}
        onNew={handleReset}
        onSave={handleSave}
        onClear={handleReset}
        saving={saving}
        saveLabel="Submit Requisition"
        onExportExcel={() => exportToCsv(listColumns, filteredRequisitions, 'rm_requisitions.csv')}
        onExportPdf={() => exportToPdf(listColumns, filteredRequisitions, 'Raw Material Requisitions', 'rm_requisitions')}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>
        )}

        <FormSection icon={ClipboardPlus} title="1. Requisition Details" subtitle="Pick order, material and part">
          <Field label="Requisition No">
            {/* Auto-generated on save (REQ-2026-001, ...), never user-entered. */}
            <AutoFillBox value="(auto-generated on save)" />
          </Field>
          <Field label="Production Order (PRD No)" required>
            <SearchableSelect value={form.prd_no} onChange={handlePrdChange} options={orders.map((o) => o.prd_no)} />
          </Field>
          <Field label="Raw Material" required>
            {/* Filtered to this order's own product BOM, not every raw material
                in the master -- a requisition only makes sense for a material
                the product actually consumes. */}
            <SearchableSelect
              value={form.raw_material_code}
              onChange={handleMaterialChange}
              disabled={!form.prd_no}
              options={bomForProduct.map((b) => {
                const rm = rawMaterials.find((r) => r.raw_material_code === b.raw_material_code)
                return { value: b.raw_material_code, label: rm?.raw_material_name ? `${b.raw_material_code} - ${rm.raw_material_name}` : b.raw_material_code }
              })}
            />
          </Field>
          {form.prd_no && bomForProduct.length === 0 && (
            <p className="text-sm text-amber-600 sm:col-span-3">
              Product "{selectedOrder?.part_serial_number}" has no Bill of Materials defined yet in Product Master.
            </p>
          )}
          <Field label="Qty Required" required>
            {/* Pre-filled from "order material requirement" once a material is
                picked, but left editable -- a requisition can legitimately ask
                for more or less than the order's raw computed need. */}
            <TextInput type="number" value={form.qty_required} onChange={handleField('qty_required')} />
          </Field>
          <Field label="Part Name">
            <AutoFillBox value={form.part_name} />
          </Field>
          <Field label="Part Serial Number">
            <AutoFillBox value={form.part_serial_number} />
          </Field>
          <Field label="Part Drawing Reference Number">
            <AutoFillBox value={form.part_drawing_reference_number} />
          </Field>
          <Field label="Requested By">
            <EmployeeSelect employees={employees} value={form.employee_id} onChange={handleField('employee_id')} />
          </Field>
        </FormSection>

        <RecordsList
          title="Raw Material Requisitions"
          columns={listColumns}
          rows={filteredRequisitions}
          loading={loading}
          error={null}
          rowKey="id"
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by PRD / Raw Material..."
        />
      </div>
    </div>
  )
}
