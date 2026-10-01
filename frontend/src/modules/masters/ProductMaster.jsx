import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import { useEffect, useState } from 'react'
import { Package, Tags, Boxes, Plus, X } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import { listProducts, createProduct, updateProduct, deleteProduct } from '../../data/queries/products'
import { listRawMaterials } from '../../data/queries/rawMaterials'
import { listProductRawMaterials, setProductRawMaterials } from '../../data/queries/productRawMaterials'

const EMPTY_FORM = {
  product_code: '',
  product_name: '',
  product_category: '',
  product_type: '',
  unit_of_measurement: '',
  product_status: '',
}

const EMPTY_BOM_ROW = { raw_material_code: '', consumption_per_unit: '' }

const LIST_COLUMNS = [
  { key: 'product_code', label: 'Product Code' },
  { key: 'product_name', label: 'Product Name' },
  { key: 'product_category', label: 'Category' },
  { key: 'product_type', label: 'Type' },
  { key: 'unit_of_measurement', label: 'UoM' },
  { key: 'product_status', label: 'Status', type: 'status' },
]

export default function ProductMaster() {
  const [records, setRecords] = useState([])
  const [rawMaterials, setRawMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [listSearch, setListSearch] = useState('')
  const [toolbarSearch, setToolbarSearch] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  // Most products use exactly one raw material -- default to a single BOM
  // row, not a repeatable table. A second (or further) material is still
  // supported (product raw materials has no row-count limit), just reached
  // via "+ Add another material" rather than shown as a multi-row grid by default.
  const [bomRows, setBomRows] = useState([{ ...EMPTY_BOM_ROW }])
  const [mode, setMode] = useState('new')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [products, rms] = await Promise.all([listProducts(), listRawMaterials()])
      setRecords(products)
      setRawMaterials(rms)
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

  function handleBomField(index, key) {
    return (e) =>
      setBomRows((rows) => rows.map((r, i) => (i === index ? { ...r, [key]: e.target.value } : r)))
  }

  function addBomRow() {
    setBomRows((rows) => [...rows, { ...EMPTY_BOM_ROW }])
  }

  function removeBomRow(index) {
    setBomRows((rows) => rows.filter((_, i) => i !== index))
  }

  function handleNew() {
    setForm(EMPTY_FORM)
    setBomRows([{ ...EMPTY_BOM_ROW }])
    setMode('new')
    setSaveError(null)
  }

  function handleClear() {
    setForm(EMPTY_FORM)
    setBomRows([{ ...EMPTY_BOM_ROW }])
    setMode('new')
    setSaveError(null)
  }

  async function handleRowClick(row) {
    // Guard against a DB null overwriting EMPTY_FORM's '' default (would
    // otherwise make a controlled input briefly uncontrolled on load).
    const sanitized = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v ?? '']))
    setForm({ ...EMPTY_FORM, ...sanitized })
    setMode('view')
    setSaveError(null)
    try {
      const bom = await listProductRawMaterials(row.product_code)
      setBomRows(
        bom.length > 0
          ? bom.map((r) => ({ raw_material_code: r.raw_material_code, consumption_per_unit: r.consumption_per_unit }))
          : [{ ...EMPTY_BOM_ROW }]
      )
    } catch (e) {
      setSaveError(e.message)
    }
  }

  function handleEdit() {
    if (!form.product_code) return
    setMode('edit')
  }

  async function handleSave() {
    if (!form.product_code || !form.product_name) {
      setSaveError('Product Code and Product Name are required.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      if (mode === 'edit') {
        await updateProduct(form.product_code, form)
      } else {
        await createProduct(form)
      }
      const validBomRows = bomRows.filter((r) => r.raw_material_code && r.consumption_per_unit !== '')
      await setProductRawMaterials(form.product_code, validBomRows)
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
    if (!confirm(`Delete product ${form.product_code}? This cannot be undone.`)) return
    setSaving(true)
    setSaveError(null)
    try {
      await deleteProduct(form.product_code)
      await refresh()
      handleClear()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleExportExcel() {
    exportToCsv(LIST_COLUMNS, filteredRecords, 'product_master.csv')
  }

  function handleExportPdf() {
    exportToPdf(LIST_COLUMNS, filteredRecords, 'Product Master', 'product_master')
  }

  function handleToolbarSearch() {
    setListSearch(toolbarSearch)
  }

  const filteredRecords = records.filter((r) => {
    if (!listSearch) return true
    const q = listSearch.toLowerCase()
    return r.product_code?.toLowerCase().includes(q) || r.product_name?.toLowerCase().includes(q)
  })

  const readOnly = mode === 'view'
  const idLocked = mode !== 'new'

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Product Master" subtitle="Manage Product Information  |  Track Category, Type & Status" />
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
        searchPlaceholder="Search by Product Code / Name..."
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {saveError}
          </div>
        )}

        <div className="flex flex-wrap items-start gap-3">
          <div className="w-full lg:w-[31%]">
            <FormSection icon={Package} title="1. Product Details" subtitle="Core product identity">
              <Field label="Product Code" required>
                <TextInput value={form.product_code} onChange={handleField('product_code')} disabled={idLocked} />
              </Field>
              <Field label="Product Name" required>
                <TextInput value={form.product_name} onChange={handleField('product_name')} disabled={readOnly} />
              </Field>
            </FormSection>
          </div>

          <div className="w-full lg:w-[66.5%]">
            <FormSection icon={Tags} title="2. Classification" subtitle="Category, type and status">
              <Field label="Product Category">
                <SelectInput
                  value={form.product_category}
                  onChange={handleField('product_category')}
                  disabled={readOnly}
                  options={['Component', 'Assembly', 'Finished Product']}
                />
              </Field>
              <Field label="Product Type">
                <SelectInput
                  value={form.product_type}
                  onChange={handleField('product_type')}
                  disabled={readOnly}
                  options={['Standard', 'Customer-specific']}
                />
              </Field>
              <Field label="Unit of Measurement">
                <TextInput value={form.unit_of_measurement} onChange={handleField('unit_of_measurement')} disabled={readOnly} />
              </Field>
              <Field label="Product Status">
                <SelectInput
                  value={form.product_status}
                  onChange={handleField('product_status')}
                  disabled={readOnly}
                  options={['Active', 'Inactive', 'Obsolete']}
                />
              </Field>
            </FormSection>
          </div>

          <div className="w-full">
            <FormSection icon={Boxes} title="3. Bill of Materials" subtitle="Raw material consumed per unit">
              <div className="w-full flex flex-col gap-2">
                {bomRows.map((row, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-3">
                    <Field label="Raw Material" width="medium">
                      <SelectInput
                        value={row.raw_material_code}
                        onChange={handleBomField(i, 'raw_material_code')}
                        disabled={readOnly}
                        options={rawMaterials.map((rm) => ({
                          value: rm.raw_material_code,
                          label: rm.raw_material_name ? `${rm.raw_material_code} - ${rm.raw_material_name}` : rm.raw_material_code,
                        }))}
                      />
                    </Field>
                    <Field label="Consumption per Unit" width="short">
                      <TextInput
                        type="number"
                        value={row.consumption_per_unit}
                        onChange={handleBomField(i, 'consumption_per_unit')}
                        disabled={readOnly}
                      />
                    </Field>
                    {!readOnly && bomRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBomRow(i)}
                        className="text-gray-400 hover:text-red-500 mb-1.5"
                        title="Remove this material"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={addBomRow}
                    className="inline-flex items-center gap-1 text-xs text-bmlhblue hover:underline self-start"
                  >
                    <Plus size={13} /> Add another material
                  </button>
                )}
              </div>
            </FormSection>
          </div>
        </div>

        <RecordsList
          title="Product Master List"
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
