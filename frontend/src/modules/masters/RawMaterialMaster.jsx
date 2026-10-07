import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
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
import { saveRawMaterialWithSuppliers, validateSupplierDraftRows } from '../../utils/rawMaterialSave'

const EMPTY_FORM = {
  raw_material_code: '',
  raw_material_name: '',
  raw_material_category: '',
  rm_type: '',
  diameter_mm: '',
  length_mtrs: '',
  width: '',
  thickness: '',
}

const EMPTY_LINK_ROW = {
  supplier_id: '',
  standard_purchase_price: '',
  lead_time_days: '',
}

// Draft rows (added before Save, or re-added after a retry) have no real
// `id` yet -- a local `_draftKey` is enough for React's list key and for
// telling "already persisted" apart from "still needs inserting" at save
// time, without needing a temp negative id or similar.
let draftKeySeq = 0
function newDraftKey() {
  draftKeySeq += 1
  return `draft-${draftKeySeq}`
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

  // Add is always local-only -- never hits the DB. Whatever's typed here
  // becomes a draft row (no real id yet) in the table below; it's only
  // actually saved when Save is pressed, together with the material
  // itself, in one click -- even for a brand-new, not-yet-saved material.
  function handleAddSupplierLink() {
    const draftRow = { ...linkRow, _draftKey: newDraftKey() }
    const err = validateSupplierDraftRows(
      [...supplierLinks.filter((r) => !r.id), draftRow],
      supplierLinks.filter((r) => r.id).map((r) => r.supplier_id)
    )
    if (err) {
      setSaveError(err)
      return
    }
    setSupplierLinks((rows) => [...rows, draftRow])
    setLinkRow(EMPTY_LINK_ROW)
    setSaveError(null)
  }

  // A persisted link (has a real id) is removed immediately, same as
  // before. A draft row (added this session, not yet saved) is just
  // dropped from the local list -- there's nothing in the DB to delete.
  async function handleRemoveSupplierLink(row) {
    if (!row.id) {
      setSupplierLinks((rows) => rows.filter((r) => r !== row))
      return
    }
    if (!confirm('Remove this supplier link?')) return
    setLinkSaving(true)
    setSaveError(null)
    try {
      await deleteRmSupplierLink(row.id)
      await refreshSupplierLinks(form.raw_material_code)
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setLinkSaving(false)
    }
  }

  function supplierRowPayload(row) {
    return {
      supplier_id: row.supplier_id,
      standard_purchase_price: row.standard_purchase_price === '' ? null : Number(row.standard_purchase_price),
      lead_time_days: row.lead_time_days === '' ? null : Number(row.lead_time_days),
    }
  }

  async function handleSave() {
    if (!form.raw_material_code || !form.raw_material_name) {
      setSaveError('Raw Material Code and Name are required.')
      return
    }
    const draftRows = supplierLinks.filter((r) => !r.id)
    const persistedSupplierIds = supplierLinks.filter((r) => r.id).map((r) => r.supplier_id)
    const rowsError = validateSupplierDraftRows(draftRows, persistedSupplierIds)
    if (rowsError) {
      setSaveError(rowsError)
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      const result = await saveRawMaterialWithSuppliers({
        materialPayload: form,
        supplierRows: draftRows,
        saveMaterial: (payload) =>
          mode === 'edit' ? updateRawMaterial(form.raw_material_code, payload) : createRawMaterial(payload),
        insertSupplierRow: (row) =>
          createRmSupplierLink({ raw_material_code: form.raw_material_code, ...supplierRowPayload(row) }),
      })

      if (result.status === 'material-failed') {
        // Form and supplier rows untouched, nothing was inserted.
        setSaveError(result.error)
        return
      }

      if (result.status === 'suppliers-failed') {
        // Material IS saved -- switch the form onto it (mode 'edit') so
        // a plain "Save" retries only the supplier rows, matching how an
        // existing material is edited. Draft rows that succeeded before
        // the failure are marked persisted (via their real id) so a
        // retry's validation/insert never touches them again; only the
        // still-failed ones remain drafts.
        setSupplierLinks((rows) =>
          rows.map((r) => {
            if (r.id) return r
            const inserted = result.insertedRows.find((ir) => ir.supplier_id === r.supplier_id && ir.id)
            return inserted ? { ...inserted } : r
          })
        )
        setMode('edit')
        setForm({ ...EMPTY_FORM, ...result.material })
        setSaveError(`Material saved, suppliers not saved: ${result.error}. Press Save to retry.`)
        return
      }

      // success
      setMode('view')
      setForm({ ...EMPTY_FORM, ...result.material })
      await refresh()
      await refreshSupplierLinks(result.material.raw_material_code)
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

  function handleExportExcel() {
    exportToCsv(LIST_COLUMNS, filteredRecords, 'raw_material_master.csv')
  }

  function handleExportPdf() {
    exportToPdf(LIST_COLUMNS, filteredRecords, 'Raw Material Master', 'raw_material_master')
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

  function supplierName(id) {
    const supplier = suppliers.find((s) => s.supplier_id === id)
    return supplier ? `${supplier.supplier_name} (${supplier.supplier_id})` : id
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
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
          <div className="w-full lg:w-[48.5%]">
          <FormSection icon={Boxes} title="1. Material Details" subtitle="Core material identity">
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
          </div>

          <div className="w-full lg:w-[48.5%]">
          <FormSection icon={Ruler} title="2. Dimensions" subtitle="Physical size specifications">
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
        </div>

        <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
          <div className="bg-bmlhsky border-b border-gray-200 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-bmlhnavy">3. Suppliers for this Material</h2>
          </div>

          {!readOnly && mode === 'new' && (
            <p className="text-xs text-gray-500 px-4 pt-3">
              Suppliers added here save together with the material in one Save -- no need to save it first.
            </p>
          )}
          <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600 text-left">
                      <th className="px-4 py-2 font-medium">Supplier</th>
                      <th className="px-4 py-2 font-medium">Price</th>
                      <th className="px-4 py-2 font-medium">Lead Time (days)</th>
                      <th className="px-4 py-2 font-medium w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierLinks.map((link) => (
                      <tr key={link.id ?? link._draftKey} className="border-t border-gray-100">
                        <td className="px-4 py-2">
                          {supplierName(link.supplier_id)}
                          {!link.id && <span className="ml-1.5 text-[10px] text-amber-600">(unsaved)</span>}
                        </td>
                        <td className="px-4 py-2">{link.standard_purchase_price ?? '?'}</td>
                        <td className="px-4 py-2">{link.lead_time_days ?? '?'}</td>
                        <td className="px-4 py-2">
                          {!readOnly && (
                            <button onClick={() => handleRemoveSupplierLink(link)} disabled={linkSaving}>
                              <Trash2 size={15} className="text-red-500" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {supplierLinks.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-4 text-center text-gray-400">
                          No suppliers linked yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {!readOnly && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 p-4 border-t border-gray-200 bg-gray-50 items-end">
                  <Field label="Supplier" className="lg:col-span-1">
                    <SelectInput
                      value={linkRow.supplier_id}
                      onChange={handleLinkField('supplier_id')}
                      options={suppliers.map((s) => ({ value: s.supplier_id, label: `${s.supplier_name} (${s.supplier_id})` }))}
                    />
                  </Field>
                  <Field label="Price">
                    <TextInput
                      type="number"
                      value={linkRow.standard_purchase_price}
                      onChange={handleLinkField('standard_purchase_price')}
                    />
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
