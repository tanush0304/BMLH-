import { useEffect, useState } from 'react'
import { Wrench } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import {
  listMaintenanceChecklist,
  createMaintenanceChecklistItem,
  updateMaintenanceChecklistItem,
  deleteMaintenanceChecklistItem,
} from '../../data/queries/maintenanceChecklist'
import { listMachines } from '../../data/queries/machines'

const EMPTY_FORM = {
  id: '',
  machine_id: '',
  checklist_item: '',
  remarks: '',
}

const LIST_COLUMNS = [
  { key: 'machine_id', label: 'Machine ID' },
  { key: 'checklist_item', label: 'Checklist Item' },
  { key: 'remarks', label: 'Remarks' },
]

export default function MaintenanceMaster() {
  const [records, setRecords] = useState([])
  const [machines, setMachines] = useState([])
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
      const [items, machs] = await Promise.all([listMaintenanceChecklist(), listMachines()])
      setRecords(items)
      setMachines(machs)
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
    if (!form.id) return
    setMode('edit')
  }

  async function handleSave() {
    if (!form.checklist_item) {
      setSaveError('Checklist Item is required.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = {
        machine_id: form.machine_id || null,
        checklist_item: form.checklist_item,
        remarks: form.remarks || null,
      }
      if (mode === 'edit') {
        await updateMaintenanceChecklistItem(form.id, payload)
      } else {
        await createMaintenanceChecklistItem(payload)
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
    if (!form.id) return
    if (!confirm(`Delete this checklist item (id ${form.id})? This cannot be undone.`)) return
    setSaving(true)
    setSaveError(null)
    try {
      await deleteMaintenanceChecklistItem(form.id)
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
    a.download = 'maintenance_master.csv'
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
      r.machine_id?.toLowerCase().includes(q) || r.checklist_item?.toLowerCase().includes(q)
    )
  })

  const readOnly = mode === 'view'

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader
        title="Maintenance Master"
        subtitle="Manage Maintenance Checklists  |  Reusable Items Per Machine"
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
        searchPlaceholder="Search by Machine ID / Checklist Item..."
        onExport={handleExport}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#F5F7FA]">
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {saveError}
          </div>
        )}

        <FormSection icon={Wrench} title="1. Checklist Item Details" columns={2}>
          <Field label="Machine">
            <SelectInput
              value={form.machine_id}
              onChange={handleField('machine_id')}
              disabled={readOnly}
              options={machines.map((m) => m.machine_id)}
            />
          </Field>
          <Field label="Checklist Item" required>
            <TextInput
              value={form.checklist_item}
              onChange={handleField('checklist_item')}
              disabled={readOnly}
            />
          </Field>
          <Field label="Remarks" className="sm:col-span-2">
            <TextInput value={form.remarks} onChange={handleField('remarks')} disabled={readOnly} />
          </Field>
        </FormSection>

        <RecordsList
          title="Maintenance Master List"
          columns={LIST_COLUMNS}
          rows={filteredRecords}
          loading={loading}
          error={error}
          rowKey="id"
          selectedKey={form.id}
          onRowClick={handleRowClick}
          searchValue={listSearch}
          onSearchChange={setListSearch}
        />
      </div>
    </div>
  )
}
