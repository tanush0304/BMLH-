import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import { useEffect, useState } from 'react'
import { CalendarClock, Wrench } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, SelectInput, AutoFillBox } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import RecordsList from '../../components/RecordsList'
import {
  listMaintenanceChecklist,
  createMaintenanceChecklistItem,
  updateMaintenanceChecklistItem,
  deleteMaintenanceChecklistItem,
} from '../../data/queries/maintenanceChecklist'
import { listMaintenanceSchedules, saveMaintenanceSchedule } from '../../data/queries/maintenanceSchedules'
import { listMachines } from '../../data/queries/machines'
import { machineOptionLabel } from '../../utils/machineLabel'

const EMPTY_FORM = { id: '', machine_id: '', checklist_item: '', remarks: '' }
const EMPTY_SCHEDULE = { machine_id: '', maintenance_frequency: '', last_maintenance_date: '', next_maintenance_due: '', status: 'Active', remarks: '' }
const FREQUENCIES = ['Daily', 'Weekly', 'Fortnightly', 'Monthly']

const LIST_COLUMNS = [
  { key: 'machine_id', label: 'Machine ID' },
  { key: 'checklist_item', label: 'Checklist Item' },
  { key: 'remarks', label: 'Remarks' },
]
const SCHEDULE_COLUMNS = [
  { key: 'machine_label', label: 'Machine' },
  { key: 'manufacturer_name', label: 'Manufacturer Name' },
  { key: 'model', label: 'Model' },
  { key: 'maintenance_frequency', label: 'Maintenance Frequency' },
  { key: 'last_maintenance_date', label: 'Last Maintenance Date' },
  { key: 'next_maintenance_due', label: 'Next Due' },
  { key: 'status', label: 'Status', type: 'status' },
  { key: 'remarks', label: 'Remarks' },
]

function addFrequency(dateString, frequency) {
  if (!dateString || !frequency) return ''
  const date = new Date(`${dateString}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  if (frequency === 'Daily') date.setDate(date.getDate() + 1)
  if (frequency === 'Weekly') date.setDate(date.getDate() + 7)
  if (frequency === 'Fortnightly') date.setDate(date.getDate() + 14)
  if (frequency === 'Monthly') {
    const day = date.getDate()
    date.setDate(1)
    date.setMonth(date.getMonth() + 1)
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    date.setDate(Math.min(day, lastDay))
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function MaintenanceMaster() {
  const [records, setRecords] = useState([])
  const [scheduleRecords, setScheduleRecords] = useState([])
  const [machines, setMachines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [listSearch, setListSearch] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [scheduleForm, setScheduleForm] = useState(EMPTY_SCHEDULE)
  const [mode, setMode] = useState('new')
  const [saving, setSaving] = useState(false)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [scheduleError, setScheduleError] = useState(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [items, schedules, machs] = await Promise.all([
        listMaintenanceChecklist(), listMaintenanceSchedules(), listMachines(),
      ])
      setRecords(items)
      setScheduleRecords(schedules)
      setMachines(machs)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  function handleField(key) {
    return (e) => setForm((current) => ({ ...current, [key]: e.target.value }))
  }
  function handleScheduleField(key) {
    return (e) => setScheduleForm((current) => ({ ...current, [key]: e.target.value }))
  }
  function handleNew() { setForm(EMPTY_FORM); setMode('new'); setSaveError(null) }
  function handleClear() { handleNew() }
  function handleRowClick(row) { setForm({ ...EMPTY_FORM, ...row }); setMode('view'); setSaveError(null) }
  function handleEdit() { if (form.id) setMode('edit') }

  async function handleSave() {
    if (!form.checklist_item) { setSaveError('Checklist Item is required.'); return }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = { machine_id: form.machine_id || null, checklist_item: form.checklist_item, remarks: form.remarks || null }
      if (mode === 'edit') await updateMaintenanceChecklistItem(form.id, payload)
      else await createMaintenanceChecklistItem(payload)
      await refresh()
      setMode('view')
    } catch (e) { setSaveError(e.message) }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!form.id || !confirm(`Delete this checklist item (id ${form.id})? This cannot be undone.`)) return
    setSaving(true)
    setSaveError(null)
    try { await deleteMaintenanceChecklistItem(form.id); await refresh(); handleClear() }
    catch (e) { setSaveError(e.message) }
    finally { setSaving(false) }
  }

  function handleScheduleMachine(e) {
    const machine_id = e.target.value
    setScheduleForm((current) => ({ ...current, machine_id }))
  }

  function selectSchedule(row) {
    setScheduleForm({
      machine_id: row.machine_id,
      maintenance_frequency: row.maintenance_frequency ?? '',
      last_maintenance_date: row.last_maintenance_date ?? '',
      next_maintenance_due: row.next_maintenance_due ?? '',
      status: row.status ?? '',
      remarks: row.remarks ?? '',
    })
    setScheduleError(null)
  }

  async function handleScheduleSave() {
    if (!scheduleForm.machine_id || !scheduleForm.maintenance_frequency || !scheduleForm.last_maintenance_date) {
      setScheduleError('Machine, Maintenance Frequency and Last Maintenance Date are required.')
      return
    }
    setScheduleSaving(true)
    setScheduleError(null)
    try {
      await saveMaintenanceSchedule({
        machine_id: scheduleForm.machine_id,
        maintenance_frequency: scheduleForm.maintenance_frequency,
        last_maintenance_date: scheduleForm.last_maintenance_date,
        next_maintenance_due: addFrequency(scheduleForm.last_maintenance_date, scheduleForm.maintenance_frequency),
        status: scheduleForm.status || null,
        remarks: scheduleForm.remarks.trim() || null,
      })
      setScheduleForm(EMPTY_SCHEDULE)
      await refresh()
    } catch (e) { setScheduleError(e.message) }
    finally { setScheduleSaving(false) }
  }

  const selectedMachine = machines.find((machine) => machine.machine_id === scheduleForm.machine_id)
  const scheduleRows = scheduleRecords.map((row) => {
    const machine = machines.find((item) => item.machine_id === row.machine_id)
    return {
      ...row,
      machine_label: machine ? machineOptionLabel(machine) : row.machine_id,
      manufacturer_name: machine?.manufacturer_name ?? '',
      model: machine?.model ?? '',
    }
  })
  const filteredRecords = records.filter((row) => !listSearch || `${row.machine_id ?? ''} ${row.checklist_item ?? ''}`.toLowerCase().includes(listSearch.toLowerCase()))
  const readOnly = mode === 'view'

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Maintenance Master" subtitle="Machine schedules and reusable checklist items" />
      <ActionToolbar
        onNew={handleNew} onSave={handleSave} onEdit={handleEdit} onDelete={handleDelete} onClear={handleClear}
        canSave={!readOnly && !saving} canEdit={mode === 'view'} canDelete={mode !== 'new' && !saving}
        onExportExcel={() => exportToCsv(LIST_COLUMNS, filteredRecords, 'maintenance_master.csv')}
        onExportPdf={() => exportToPdf(LIST_COLUMNS, filteredRecords, 'Maintenance Master', 'maintenance_master')}
      />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {(saveError || error) && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{saveError || error}</div>}
        {scheduleError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{scheduleError}</div>}

        <FormSection icon={CalendarClock} title="1. Machine-level Maintenance Schedule" subtitle="Set the next maintenance due date" columns={3}>
          <Field label="Machine" required>
            <SearchableSelect value={scheduleForm.machine_id} onChange={handleScheduleMachine} options={machines.map((machine) => ({ value: machine.machine_id, label: machineOptionLabel(machine) }))} />
          </Field>
          <Field label="Manufacturer Name"><AutoFillBox value={selectedMachine?.manufacturer_name} /></Field>
          <Field label="Model"><AutoFillBox value={selectedMachine?.model} /></Field>
          <Field label="Maintenance Frequency" required>
            <SelectInput value={scheduleForm.maintenance_frequency} onChange={handleScheduleField('maintenance_frequency')} options={FREQUENCIES} />
          </Field>
          <Field label="Last Maintenance Date" required>
            <TextInput type="date" value={scheduleForm.last_maintenance_date} onChange={handleScheduleField('last_maintenance_date')} />
          </Field>
          <Field label="Next Due"><AutoFillBox value={addFrequency(scheduleForm.last_maintenance_date, scheduleForm.maintenance_frequency)} /></Field>
          <Field label="Status">
            <SelectInput value={scheduleForm.status} onChange={handleScheduleField('status')} options={['Active', 'Inactive']} />
          </Field>
          <Field label="Remarks" width="long"><TextInput value={scheduleForm.remarks} onChange={handleScheduleField('remarks')} /></Field>
          <button type="button" onClick={handleScheduleSave} disabled={scheduleSaving} className="self-end rounded bg-bmlhblue px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {scheduleSaving ? 'Saving...' : 'Save Schedule'}
          </button>
        </FormSection>
        <RecordsList title="Maintenance Schedule List" columns={SCHEDULE_COLUMNS} rows={scheduleRows} loading={loading} error={error} rowKey="machine_id" selectedKey={scheduleForm.machine_id} onRowClick={selectSchedule} />

        <FormSection icon={Wrench} title="2. Checklist Item Details" subtitle="Keep reusable checklist items per machine" columns={2}>
          <Field label="Machine">
            <SearchableSelect value={form.machine_id} onChange={handleField('machine_id')} disabled={readOnly} options={machines.map((machine) => ({ value: machine.machine_id, label: machineOptionLabel(machine) }))} />
          </Field>
          <Field label="Checklist Item" required>
            <TextInput value={form.checklist_item} onChange={handleField('checklist_item')} disabled={readOnly} />
          </Field>
          <Field label="Remarks" width="long"><TextInput value={form.remarks} onChange={handleField('remarks')} disabled={readOnly} /></Field>
        </FormSection>
        <RecordsList title="Maintenance Checklist Items" columns={LIST_COLUMNS} rows={filteredRecords} loading={loading} error={error} rowKey="id" selectedKey={form.id} onRowClick={handleRowClick} searchValue={listSearch} onSearchChange={setListSearch} searchPlaceholder="Search checklist items..." />
      </div>
    </div>
  )
}
