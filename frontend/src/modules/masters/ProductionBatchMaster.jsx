import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import { useEffect, useState } from 'react'
import { Layers } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, SelectInput, AutoFillBox } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import {
  listProductionBatches,
  createProductionBatch,
  updateProductionBatch,
  deleteProductionBatch,
} from '../../data/queries/productionBatch'
import { listProducts } from '../../data/queries/products'

const EMPTY_FORM = {
  part_serial_number: '',
  production_batch_quantity: '',
}

const LIST_COLUMNS = [
  { key: 'part_serial_number', label: 'Part Serial Number' },
  { key: 'production_batch_quantity', label: 'Batch Quantity' },
]

export default function ProductionBatchMaster() {
  const [records, setRecords] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [listSearch, setListSearch] = useState('')
  const [toolbarSearch, setToolbarSearch] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const selectedProduct = products.find((p) => p.part_serial_number === form.part_serial_number)
  const [mode, setMode] = useState('new')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [batches, prods] = await Promise.all([listProductionBatches(), listProducts()])
      setRecords(batches)
      setProducts(prods)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  function handleField(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  function handleNew() {
    setForm(EMPTY_FORM)
    setMode('new')
    setSaveError(null)
  }

  function handleClear() {
    setForm(EMPTY_FORM)
    setMode('new')
    setSaveError(null)
  }

  function handleRowClick(row) {
    setForm({ ...EMPTY_FORM, ...row })
    setMode('view')
    setSaveError(null)
  }

  function handleEdit() {
    if (!form.part_serial_number) return
    setMode('edit')
  }

  async function handleSave() {
    if (!form.part_serial_number) {
      setSaveError('Part Serial Number is required.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = {
        production_batch_quantity:
          form.production_batch_quantity === '' ? null : Number(form.production_batch_quantity),
      }
      if (mode === 'edit') {
        await updateProductionBatch(form.part_serial_number, payload)
      } else {
        await createProductionBatch({ part_serial_number: form.part_serial_number, ...payload })
      }
      await refresh()
      setMode('view')
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!form.part_serial_number) return
    if (!confirm(`Delete the batch quantity for ${form.part_serial_number}? This cannot be undone.`)) return
    setSaving(true)
    setSaveError(null)
    try {
      await deleteProductionBatch(form.part_serial_number)
      await refresh()
      handleClear()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleExportExcel() {
    exportToCsv(LIST_COLUMNS, filteredRecords, 'production_batch_master.csv')
  }

  function handleExportPdf() {
    exportToPdf(LIST_COLUMNS, filteredRecords, 'Production Batch Master', 'production_batch_master')
  }

  function handleToolbarSearch() {
    setListSearch(toolbarSearch)
  }

  const filteredRecords = records.filter((r) => {
    if (!listSearch) return true
    return r.part_serial_number?.toLowerCase().includes(listSearch.toLowerCase())
  })

  const readOnly = mode === 'view'
  const pkLocked = mode !== 'new'

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader
        title="Production Batch Master"
        subtitle="Manage Standard Batch Quantities  |  One Per Product"
      />
      <ActionToolbar
        onNew={handleNew}
        onSave={handleSave}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onClear={handleClear}
        canSave={!readOnly && !saving}
        canEdit={mode === 'view'}
        canDelete={mode !== 'new' && !saving}
        searchValue={toolbarSearch}
        onSearchChange={setToolbarSearch}
        onSearch={handleToolbarSearch}
        searchPlaceholder="Search by Part Serial Number..."
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {saveError}
          </div>
        )}

        <FormSection icon={Layers} title="1. Batch Details" subtitle="Standard qty per product" columns={2}>
          <Field label="Part Serial Number" required>
            <SelectInput
              value={form.part_serial_number}
              onChange={handleField('part_serial_number')}
              disabled={readOnly || pkLocked}
              options={products.map((p) => p.part_serial_number)}
            />
          </Field>
          <Field label="Part Name">
            <AutoFillBox value={selectedProduct?.part_name} />
          </Field>
          <Field label="Part Drawing Number">
            <AutoFillBox value={selectedProduct?.part_drawing_reference_number} />
          </Field>
          <Field label="Production Batch Quantity">
            <TextInput
              type="number"
              value={form.production_batch_quantity}
              onChange={handleField('production_batch_quantity')}
              disabled={readOnly}
            />
          </Field>
        </FormSection>

        <RecordsList
          title="Production Batch Master List"
          columns={LIST_COLUMNS}
          rows={filteredRecords}
          loading={loading}
          error={error}
          rowKey="part_serial_number"
          selectedKey={form.part_serial_number}
          onRowClick={handleRowClick}
          searchValue={listSearch}
          onSearchChange={setListSearch}
        />
      </div>
    </div>
  )
}
