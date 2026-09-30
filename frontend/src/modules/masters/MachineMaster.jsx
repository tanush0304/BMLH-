import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import { useEffect, useState } from 'react'
import { Factory, Cog, ListChecks } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import MultiSelectDropdown from '../../components/MultiSelectDropdown'
import RecordsList from '../../components/RecordsList'
import { listMachines, createMachine, updateMachine, deleteMachine } from '../../data/queries/machines'
import { listOperationsForMachine, setMachineOperations } from '../../data/queries/machineOps'

const EMPTY_FORM = {
  machine_id: '',
  machine_name: '',
  machine_oem: '',
  category: '',
  machine_type: '',
  make: '',
  model: '',
  serial_no: '',
}

// No master table of operation names exists in the schema (machine ops
// just stores free text) -- this is a working list of shop-floor
// operations, not a live-fetched lookup. Adjust here if BMLH's actual
// operation vocabulary differs.
const OPERATION_OPTIONS = [
  'Turning',
  'Milling',
  'Drilling',
  'Grinding',
  'Cutting',
  'Broaching',
  'Boring',
  'Tapping',
  'Deburring',
  'Inspection',
]

const LIST_COLUMNS = [
  { key: 'machine_id', label: 'Machine ID' },
  { key: 'machine_name', label: 'Machine Name' },
  { key: 'category', label: 'Category' },
  { key: 'machine_oem', label: 'OEM' },
  { key: 'make', label: 'Make' },
  { key: 'model', label: 'Model' },
]

export default function MachineMaster() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [listSearch, setListSearch] = useState('')
  const [toolbarSearch, setToolbarSearch] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [operations, setOperations] = useState([])
  const [mode, setMode] = useState('new')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      setRecords(await listMachines())
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
    setOperations([])
    setMode('new')
    setSaveError(null)
  }

  function handleClear() {
    setForm(EMPTY_FORM)
    setOperations([])
    setMode('new')
    setSaveError(null)
  }

  async function handleRowClick(row) {
    setForm({ ...EMPTY_FORM, ...row })
    setMode('view')
    setSaveError(null)
    try {
      const ops = await listOperationsForMachine(row.machine_id)
      setOperations(ops.map((o) => o.operation))
    } catch (e) {
      setSaveError(e.message)
    }
  }

  function handleEdit() {
    if (!form.machine_id) return
    setMode('edit')
  }

  async function handleSave() {
    if (!form.machine_id || !form.machine_name) {
      setSaveError('Machine ID and Machine Name are required.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      if (mode === 'edit') {
        await updateMachine(form.machine_id, form)
      } else {
        await createMachine(form)
      }
      await setMachineOperations(form.machine_id, operations.filter(Boolean))
      await refresh()
      setMode('view')
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!form.machine_id) return
    if (!confirm(`Delete machine ${form.machine_id}? This cannot be undone.`)) return
    setSaving(true)
    setSaveError(null)
    try {
      await deleteMachine(form.machine_id)
      await refresh()
      handleClear()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleExportExcel() {
    exportToCsv(LIST_COLUMNS, filteredRecords, 'machine_master.csv')
  }

  function handleExportPdf() {
    exportToPdf(LIST_COLUMNS, filteredRecords, 'Machine Master', 'machine_master')
  }

  function handleToolbarSearch() {
    setListSearch(toolbarSearch)
  }

  const filteredRecords = records.filter((r) => {
    if (!listSearch) return true
    const q = listSearch.toLowerCase()
    return r.machine_id?.toLowerCase().includes(q) || r.machine_name?.toLowerCase().includes(q)
  })

  const readOnly = mode === 'view'
  const idLocked = mode !== 'new'

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Machine Master" subtitle="Manage Machine Inventory  |  Track Assets & Capabilities" />
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
        searchPlaceholder="Search by Machine ID / Name..."
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {saveError}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <FormSection icon={Factory} title="1. Machine Details">
            <Field label="Machine ID" required>
              <TextInput value={form.machine_id} onChange={handleField('machine_id')} disabled={idLocked} />
            </Field>
            <Field label="Machine Name" required>
              <TextInput value={form.machine_name} onChange={handleField('machine_name')} disabled={readOnly} />
            </Field>
            <Field label="Machine OEM">
              <TextInput value={form.machine_oem} onChange={handleField('machine_oem')} disabled={readOnly} />
            </Field>
            <Field label="Category">
              <SelectInput
                value={form.category}
                onChange={handleField('category')}
                disabled={readOnly}
                options={['Cutting', 'CNC Turning', 'VMC', 'Grinding']}
              />
            </Field>
          </FormSection>

          <FormSection icon={Cog} title="2. Asset Details">
            <Field label="Machine Type">
              <TextInput value={form.machine_type} onChange={handleField('machine_type')} disabled={readOnly} />
            </Field>
            <Field label="Make">
              <TextInput value={form.make} onChange={handleField('make')} disabled={readOnly} />
            </Field>
            <Field label="Model">
              <TextInput value={form.model} onChange={handleField('model')} disabled={readOnly} />
            </Field>
            <Field label="Serial No">
              <TextInput value={form.serial_no} onChange={handleField('serial_no')} disabled={readOnly} />
            </Field>
          </FormSection>

          <FormSection icon={ListChecks} title="3. Nature of Operation">
            <Field label="Operations Performed" width="long">
              <MultiSelectDropdown
                options={OPERATION_OPTIONS}
                selected={operations}
                onChange={setOperations}
                disabled={readOnly}
                placeholder="Select operations..."
                key={mode === 'new' ? 'new' : form.machine_id}
              />
            </Field>
          </FormSection>
        </div>

        <RecordsList
          title="Machine Master List"
          columns={LIST_COLUMNS}
          rows={filteredRecords}
          loading={loading}
          error={error}
          rowKey="machine_id"
          selectedKey={form.machine_id}
          onRowClick={handleRowClick}
          searchValue={listSearch}
          onSearchChange={setListSearch}
        />
      </div>
    </div>
  )
}
