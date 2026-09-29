import { useEffect, useState } from 'react'
import { Layers } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import {
  listProductionBatches,
  createProductionBatch,
  updateProductionBatch,
  deleteProductionBatch,
} from '../../data/queries/productionBatch'
import { listProducts } from '../../data/queries/products'

const EMPTY_FORM = {
  product_code: '',
  production_batch_quantity: '',
}

const LIST_COLUMNS = [
  { key: 'product_code', label: 'Product Code' },
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
    if (!form.product_code) return
    setMode('edit')
  }

  async function handleSave() {
    if (!form.product_code) {
      setSaveError('Product Code is required.')
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
        await updateProductionBatch(form.product_code, payload)
      } else {
        await createProductionBatch({ product_code: form.product_code, ...payload })
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
    if (!form.product_code) return
    if (!confirm(`Delete the batch quantity for ${form.product_code}? This cannot be undone.`)) return
    setSaving(true)
    setSaveError(null)
    try {
      await deleteProductionBatch(form.product_code)
      await refresh()
      handleClear()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleExport() {
    const header = LIST_COLUMNS.map((c) => c.label).join(',')
    const rows = filteredRecords.map((r) => LIST_COLUMNS.map((c) => r[c.key] ?? '').join(','))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'production_batch_master.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleToolbarSearch() {
    setListSearch(toolbarSearch)
  }

  const filteredRecords = records.filter((r) => {
    if (!listSearch) return true
    return r.product_code?.toLowerCase().includes(listSearch.toLowerCase())
  })

  const readOnly = mode === 'view'
  const pkLocked = mode !== 'new'

  return (
    <div className="flex-1 flex flex-col min-w-0">
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
        searchPlaceholder="Search by Product Code..."
        onExport={handleExport}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {saveError}
          </div>
        )}

        <FormSection icon={Layers} title="1. Batch Details" columns={2}>
          <Field label="Product Code" required>
            <SelectInput
              value={form.product_code}
              onChange={handleField('product_code')}
              disabled={readOnly || pkLocked}
              options={products.map((p) => p.product_code)}
            />
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
          rowKey="product_code"
          selectedKey={form.product_code}
          onRowClick={handleRowClick}
          searchValue={listSearch}
          onSearchChange={setListSearch}
        />
      </div>
    </div>
  )
}
