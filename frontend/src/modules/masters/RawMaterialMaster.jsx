import { useEffect, useState } from 'react'
import { Boxes, Ruler, Trash2, Plus } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import {
  listRawMaterials,
  createRawMaterial,
  updateRawMaterial,
  deleteRawMaterial,
} from '../../data/queries/rawMaterials'
import { listSuppliers } from '../../data/queries/suppliers'
import {
  listSuppliersForRawMaterial,
  createRmSupplierLink,
  deleteRmSupplierLink,
} from '../../data/queries/rmSuppliers'

const EMPTY_FORM = {
  raw_material_code: '',
  raw_material_name: '',
  raw_material_category: '',
  rm_type: '',
  diameter_mm: '',
  length_mtrs: '',
  width: '',
  thickness: '',
  unit_of_measurement: '',
}

const EMPTY_LINK_ROW = {
  supplier_id: '',
  material_service_code: '',
  material_description: '',
  unit_of_measurement: '',
  standard_purchase_price: '',
  minimum_order_qty: '',
  lead_time_days: '',
}

const LIST_COLUMNS = [
  { key: 'raw_material_code', label: 'RM Code' },
  { key: 'raw_material_name', label: 'RM Name' },
  { key: 'raw_material_category', label: 'Category' },
  { key: 'rm_type', label: 'Type' },
  { key: 'unit_of_measurement', label: 'UoM' },
]

export default function RawMaterialMaster() {
  const [records, setRecords] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [listSearch, setListSearch] = useState('')
  const [toolbarSearch, setToolbarSearch] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [mode, setMode] = useState('new')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const [supplierLinks, setSupplierLinks] = useState([])
  const [linkRow, setLinkRow] = useState(EMPTY_LINK_ROW)
  const [linkSaving, setLinkSaving] = useState(false)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [materials, sups] = await Promise.all([listRawMaterials(), listSuppliers()])
      setRecords(materials)
      setSuppliers(sups)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function refreshSupplierLinks(rawMaterialCode) {
    try {
      setSupplierLinks(await listSuppliersForRawMaterial(rawMaterialCode))
    } catch (e) {
      setSaveError(e.message)
    }
  }

  function handleField(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  function handleLinkField(key) {
    return (e) => setLinkRow((r) => ({ ...r, [key]: e.target.value }))
  }

  function handleNew() {
    setForm(EMPTY_FORM)
    setSupplierLinks([])
    setLinkRow(EMPTY_LINK_ROW)
    setMode('new')
    setSaveError(null)
  }

  function handleClear() {
    setForm(EMPTY_FORM)
    setSupplierLinks([])
    setLinkRow(EMPTY_LINK_ROW)
    setMode('new')
    setSaveError(null)
  }

  async function handleRowClick(row) {
    setForm({ ...EMPTY_FORM, ...row })
    setMode('view')
    setSaveError(null)
    await refreshSupplierLinks(row.raw_material_code)
  }

  function handleEdit() {
    if (!form.raw_material_code) return
    setMode('edit')
  }

  async function handleSave() {
    if (!form.raw_material_code || !form.raw_material_name) {
      setSaveError('Raw Material Code and Name are required.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      if (mode === 'edit') {
        await updateRawMaterial(form.raw_material_code, form)
      } else {
        await createRawMaterial(form)
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
    if (!form.raw_material_code) return
    if (!confirm(`Delete raw material ${form.raw_material_code}? This cannot be undone.`)) return
    setSaving(true)
    setSaveError(null)
    try {
      await deleteRawMaterial(form.raw_material_code)
      await refresh()
      handleClear()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddSupplierLink() {
    if (!linkRow.supplier_id) {
      setSaveError('Choose a supplier before adding.')
      return
    }
    setLinkSaving(true)
    setSaveError(null)
    try {
      await createRmSupplierLink({
        raw_material_code: form.raw_material_code,
        supplier_id: linkRow.supplier_id,
        material_service_code: linkRow.material_service_code || null,
        material_description: linkRow.material_description || null,
        unit_of_measurement: linkRow.unit_of_measurement || null,
        standard_purchase_price:
          linkRow.standard_purchase_price === '' ? null : Number(linkRow.standard_purchase_price),
        minimum_order_qty: linkRow.minimum_order_qty === '' ? null : Number(linkRow.minimum_order_qty),
        lead_time_days: linkRow.lead_time_days === '' ? null : Number(linkRow.lead_time_days),
      })
      setLinkRow(EMPTY_LINK_ROW)
      await refreshSupplierLinks(form.raw_material_code)
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setLinkSaving(false)
    }
  }

  async function handleRemoveSupplierLink(id) {
    if (!confirm('Remove this supplier link?')) return
    setLinkSaving(true)
    setSaveError(null)
    try {
      await deleteRmSupplierLink(id)
      await refreshSupplierLinks(form.raw_material_code)
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setLinkSaving(false)
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
    a.download = 'raw_material_master.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleToolbarSearch() {
    setListSearch(toolbarSearch)
  }

  const filteredRecords = records.filter((r) => {
    if (!listSearch) return true
    const q = listSearch.toLowerCase()
    return (
      r.raw_material_code?.toLowerCase().includes(q) || r.raw_material_name?.toLowerCase().includes(q)
    )
  })

  const readOnly = mode === 'view'
  const codeLocked = mode !== 'new'
  const canManageSuppliers = mode !== 'new'

  function supplierName(id) {
    return suppliers.find((s) => s.supplier_id === id)?.supplier_name ?? id
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader
        title="Raw Material Master"
        subtitle="Manage Raw Material Inventory  |  Track Type, Dimensions & Suppliers"
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
        searchPlaceholder="Search by RM Code / Name..."
        onExport={handleExport}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F5F7FA]">
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {saveError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <FormSection icon={Boxes} title="1. Material Details">
            <Field label="Raw Material Code" required>
              <TextInput
                value={form.raw_material_code}
                onChange={handleField('raw_material_code')}
                disabled={codeLocked}
              />
            </Field>
            <Field label="Raw Material Name" required>
              <TextInput
                value={form.raw_material_name}
                onChange={handleField('raw_material_name')}
                disabled={readOnly}
              />
            </Field>
            <Field label="Category">
              <SelectInput
                value={form.raw_material_category}
                onChange={handleField('raw_material_category')}
                disabled={readOnly}
                options={['Steel', 'Aluminium', 'Alloy', 'Consumables']}
              />
            </Field>
            <Field label="Type">
              <SelectInput
                value={form.rm_type}
                onChange={handleField('rm_type')}
                disabled={readOnly}
                options={['Bar', 'Sheet', 'Plate', 'Casting', 'Forging', 'Consumable']}
              />
            </Field>
          </FormSection>

          <FormSection icon={Ruler} title="2. Dimensions">
            <Field label="Diameter (mm)">
              <TextInput value={form.diameter_mm} onChange={handleField('diameter_mm')} disabled={readOnly} />
            </Field>
            <Field label="Length (mtrs)">
              <TextInput
                type="number"
                value={form.length_mtrs}
                onChange={handleField('length_mtrs')}
                disabled={readOnly}
              />
            </Field>
            <Field label="Width">
              <TextInput type="number" value={form.width} onChange={handleField('width')} disabled={readOnly} />
            </Field>
            <Field label="Thickness">
              <TextInput
                type="number"
                value={form.thickness}
                onChange={handleField('thickness')}
                disabled={readOnly}
              />
            </Field>
            <Field label="Unit of Measurement">
              <TextInput
                value={form.unit_of_measurement}
                onChange={handleField('unit_of_measurement')}
                disabled={readOnly}
              />
            </Field>
          </FormSection>
        </div>

        <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
          <div className="bg-bmlhsky border-b border-gray-200 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-bmlhnavy">3. Suppliers for this Material</h2>
          </div>

          {!canManageSuppliers ? (
            <p className="text-sm text-gray-400 px-4 py-4">
              Save the raw material first, then add suppliers here.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600 text-left">
                      <th className="px-4 py-2 font-medium">Supplier</th>
                      <th className="px-4 py-2 font-medium">Service Code</th>
                      <th className="px-4 py-2 font-medium">Description</th>
                      <th className="px-4 py-2 font-medium">UoM</th>
                      <th className="px-4 py-2 font-medium">Price</th>
                      <th className="px-4 py-2 font-medium">MOQ</th>
                      <th className="px-4 py-2 font-medium">Lead Time (d)</th>
                      <th className="px-4 py-2 font-medium w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierLinks.map((link) => (
                      <tr key={link.id} className="border-t border-gray-100">
                        <td className="px-4 py-2">{supplierName(link.supplier_id)}</td>
                        <td className="px-4 py-2">{link.material_service_code ?? '—'}</td>
                        <td className="px-4 py-2">{link.material_description ?? '—'}</td>
                        <td className="px-4 py-2">{link.unit_of_measurement ?? '—'}</td>
                        <td className="px-4 py-2">{link.standard_purchase_price ?? '—'}</td>
                        <td className="px-4 py-2">{link.minimum_order_qty ?? '—'}</td>
                        <td className="px-4 py-2">{link.lead_time_days ?? '—'}</td>
                        <td className="px-4 py-2">
                          {!readOnly && (
                            <button onClick={() => handleRemoveSupplierLink(link.id)} disabled={linkSaving}>
                              <Trash2 size={15} className="text-red-500" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {supplierLinks.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-4 text-center text-gray-400">
                          No suppliers linked yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {!readOnly && (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 p-4 border-t border-gray-200 bg-gray-50 items-end">
                  <Field label="Supplier" className="lg:col-span-1">
                    <SelectInput
                      value={linkRow.supplier_id}
                      onChange={handleLinkField('supplier_id')}
                      options={suppliers.map((s) => s.supplier_id)}
                    />
                  </Field>
                  <Field label="Service Code">
                    <TextInput value={linkRow.material_service_code} onChange={handleLinkField('material_service_code')} />
                  </Field>
                  <Field label="Description">
                    <TextInput value={linkRow.material_description} onChange={handleLinkField('material_description')} />
                  </Field>
                  <Field label="UoM">
                    <TextInput value={linkRow.unit_of_measurement} onChange={handleLinkField('unit_of_measurement')} />
                  </Field>
                  <Field label="Price">
                    <TextInput
                      type="number"
                      value={linkRow.standard_purchase_price}
                      onChange={handleLinkField('standard_purchase_price')}
                    />
                  </Field>
                  <Field label="MOQ">
                    <TextInput type="number" value={linkRow.minimum_order_qty} onChange={handleLinkField('minimum_order_qty')} />
                  </Field>
                  <Field label="Lead Time (d)">
                    <TextInput type="number" value={linkRow.lead_time_days} onChange={handleLinkField('lead_time_days')} />
                  </Field>
                  <button
                    onClick={handleAddSupplierLink}
                    disabled={linkSaving}
                    className="inline-flex items-center justify-center gap-1.5 bg-bmlhblue text-white rounded px-3 py-2 text-sm font-medium disabled:opacity-40"
                  >
                    <Plus size={15} /> Add
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <RecordsList
          title="Raw Material Master List"
          columns={LIST_COLUMNS}
          rows={filteredRecords}
          loading={loading}
          error={error}
          rowKey="raw_material_code"
          selectedKey={form.raw_material_code}
          onRowClick={handleRowClick}
          searchValue={listSearch}
          onSearchChange={setListSearch}
        />
      </div>
    </div>
  )
}
