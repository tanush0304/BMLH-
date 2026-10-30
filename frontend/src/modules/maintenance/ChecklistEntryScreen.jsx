import { useEffect, useState } from 'react'
import { Wrench, ClipboardCheck, Pencil } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import RecordsList from '../../components/RecordsList'
import { listMachines } from '../../data/queries/machines'
import { listEmployees } from '../../data/queries/employees'
import { machineOptionLabel } from '../../utils/machineLabel'
import { employeeLabelForId } from '../../utils/employeeLabel'
import EmployeeSelect from '../../components/EmployeeSelect'
import { listShifts } from '../../data/queries/shifts'
import {
  listChecklistItemsForMachine,
  createMaintenanceLog,
  addMaintenanceLogItem,
  listRecentMaintenanceLogs,
  listMaintenanceLogItems,
  updateMaintenanceLog,
  updateMaintenanceLogItem,
} from '../../data/queries/maintenanceLogs'
import { canEditStock } from '../../utils/stockEdit'
import { useAppUsers, withEditedLabels, EDITED_COLUMN } from '../../components/StockEditPanel'
import Banner from '../../components/Banner'
import SelectWithAddNew, { mergeOptions } from '../../components/SelectWithAddNew'

// Type of Maintenance built-ins (per the client's Maintenance Module sheet,
// + Quarterly / Yearly); "+ Add new" values saved on visits are offered too.
const MAINTENANCE_TYPES = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly']

export default function ChecklistEntryScreen({ role }) {
  const [machines, setMachines] = useState([])
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [recentLogs, setRecentLogs] = useState([])
  const maintenanceTypeOptions = mergeOptions(MAINTENANCE_TYPES, recentLogs.map((l) => l.maintenance_type))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [machineId, setMachineId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [shiftCode, setShiftCode] = useState('')
  const [logDate, setLogDate] = useState('')
  const [maintenanceType, setMaintenanceType] = useState('')
  const [checklistItems, setChecklistItems] = useState([])
  const [activeLog, setActiveLog] = useState(null)
  const [itemResults, setItemResults] = useState({})
  const [starting, setStarting] = useState(false)
  const [savingItems, setSavingItems] = useState(false)
  const [search, setSearch] = useState('')
  // Supervisor/admin edit of a saved visit (032): header + its saved items.
  const appUsers = useAppUsers()
  const [selectedLog, setSelectedLog] = useState(null)
  const [editingLog, setEditingLog] = useState(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [machs, employeeRows, shf, logs] = await Promise.all([
        listMachines(),
        listEmployees(),
        listShifts(),
        listRecentMaintenanceLogs(),
      ])
      setMachines(machs)
      setEmployees(employeeRows)
      setShifts(shf)
      setRecentLogs(logs)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleMachineChange(e) {
    const id = e.target.value
    setMachineId(id)
    setActiveLog(null)
    setChecklistItems([])
    setItemResults({})
    if (!id) return
    setError(null)
    try {
      setChecklistItems(await listChecklistItemsForMachine(id))
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleStartVisit() {
    if (!machineId || !employeeId || !shiftCode || !logDate) {
      setError('Machine, Engineer, Shift and Date are all required to start a visit.')
      return
    }
    setStarting(true)
    setError(null)
    try {
      const log = await createMaintenanceLog({
        machine_id: machineId,
        employee_id: employeeId,
        shift_code: shiftCode,
        log_date: logDate,
        maintenance_type: maintenanceType || null,
      })
      setActiveLog(log)
      setRecentLogs((await listRecentMaintenanceLogs()) ?? [])
    } catch (e) {
      setError(e.message)
    } finally {
      setStarting(false)
    }
  }

  function updateItemResult(itemId, field, value) {
    setItemResults((r) => ({ ...r, [itemId]: { ...r[itemId], [field]: value } }))
  }

  // Toolbar Save: starts the visit first; once started, saves every checklist
  // row that has a Condition and is not saved yet (one insert per row).
  async function handleSave() {
    if (!activeLog) return handleStartVisit()
    const pending = checklistItems.filter((item) => !itemResults[item.id]?.saved)
    const ready = pending.filter((item) => itemResults[item.id]?.condition)
    if (ready.length === 0) {
      setError(pending.length === 0 ? 'Every checklist item is already saved.' : 'Pick OK / Not OK on at least one checklist item before saving.')
      return
    }
    setSavingItems(true)
    setError(null)
    try {
      for (const item of ready) {
        const result = itemResults[item.id]
        await addMaintenanceLogItem({
          maintenance_log_id: activeLog.id,
          checklist_item_id: item.id,
          condition: result.condition,
          observation: result.observation || null,
          action_taken: result.action_taken || null,
        })
        updateItemResult(item.id, 'saved', true)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingItems(false)
    }
  }

  // New / Clear: back to an empty visit form (a started visit and its saved
  // items stay in the DB). Engineer and Shift are kept.
  function handleClear() {
    setSelectedLog(null)
    setEditingLog(null)
    setMachineId('')
    setLogDate('')
    setMaintenanceType('')
    setActiveLog(null)
    setChecklistItems([])
    setItemResults({})
    setError(null)
  }

  async function handleSaveEdit(header, items, originalItems) {
    if (!header.employee_id || !header.shift_code) return 'Engineer and Shift are required.'
    const log = editingLog
    if (header.employee_id !== log.employee_id || header.shift_code !== log.shift_code || (header.maintenance_type || null) !== (log.maintenance_type || null)) {
      await updateMaintenanceLog(log.id, { employee_id: header.employee_id, shift_code: header.shift_code, maintenance_type: header.maintenance_type || null })
    }
    for (const item of items) {
      const before = originalItems.find((o) => o.id === item.id)
      const patch = { condition: item.condition, observation: item.observation?.trim() || null, action_taken: item.action_taken?.trim() || null }
      if (patch.condition !== before.condition || patch.observation !== (before.observation || null) || patch.action_taken !== (before.action_taken || null)) {
        await updateMaintenanceLogItem(item.id, patch)
      }
    }
    setEditingLog(null)
    setSelectedLog(null)
    setRecentLogs((await listRecentMaintenanceLogs()) ?? [])
    return null
  }

  const filteredRecentLogs = withEditedLabels(recentLogs, appUsers).filter((l) => {
    if (!search) return true
    return l.machine_id?.toLowerCase().includes(search.toLowerCase())
  })

  const logColumns = [
    { key: 'machine_id', label: 'Machine ID' },
    { key: 'employee_id', label: 'Engineer', render: (r) => employeeLabelForId(r.employee_id, employees) },
    { key: 'shift_code', label: 'Shift' },
    { key: 'log_date', label: 'Date' },
    { key: 'maintenance_type', label: 'Type' },
  ]

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Maintenance Checklist Entry" subtitle="One Visit, Several Checklist Items" />
      {/* Edit (supervisor/admin, 032) corrects a saved visit; no Delete. */}
      <ActionToolbar
        showEditDelete={canEditStock(role)}
        showDelete={false}
        onEdit={() => setEditingLog(selectedLog)}
        canEdit={!!selectedLog && !editingLog}
        onNew={handleClear}
        onSave={handleSave}
        onClear={handleClear}
        saving={starting || savingItems}
        saveLabel={activeLog ? 'Save Checklist' : 'Start Visit'}
        onExportExcel={() => exportToCsv(logColumns, filteredRecentLogs, 'maintenance_visits.csv')}
        onExportPdf={() => exportToPdf(logColumns, filteredRecentLogs, 'Recent Maintenance Visits', 'maintenance_visits')}
      />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <Banner tone="error" message={error} />
        )}

        <FormSection icon={Wrench} title="1. Visit Details" subtitle="Maintenance visit and machine" columns={4}>
          <Field label="Machine" required>
            <SearchableSelect value={machineId} onChange={handleMachineChange} disabled={!!activeLog} options={machines.map((m) => ({ value: m.machine_id, label: machineOptionLabel(m) }))} />
          </Field>
          <Field label="Maintenance Engineer" required>
            <EmployeeSelect employees={employees} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={!!activeLog} />
          </Field>
          <Field label="Shift" required>
            <SelectInput value={shiftCode} onChange={(e) => setShiftCode(e.target.value)} disabled={!!activeLog} options={shifts.map((s) => s.shift_code)} />
          </Field>
          <Field label="Date" required>
            <TextInput type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} disabled={!!activeLog} />
          </Field>
          <Field label="Type of Maintenance">
            <SelectWithAddNew
              value={maintenanceType}
              onChange={(e) => setMaintenanceType(e.target.value)}
              disabled={!!activeLog}
              options={maintenanceTypeOptions}
            />
          </Field>
          {machineId && checklistItems.length === 0 && (
            <p className="text-sm text-gray-400 sm:col-span-4">No checklist items defined for this machine yet.</p>
          )}
        </FormSection>

        {activeLog && checklistItems.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="bg-bmlhsky border-b border-gray-200 px-4 py-2.5 flex items-center gap-2">
              <ClipboardCheck size={16} className="text-bmlhnavy" />
              <h2 className="text-sm font-semibold text-bmlhnavy">2. Checklist Items</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {checklistItems.map((item) => {
                const result = itemResults[item.id] ?? {}
                return (
                  <div key={item.id} className="grid grid-cols-1 sm:grid-cols-5 gap-2 p-4 items-end">
                    <div className="sm:col-span-1">
                      <p className="text-sm font-medium text-gray-700">{item.checklist_item}</p>
                    </div>
                    <Field label="Condition">
                      <SelectInput
                        value={result.condition ?? ''}
                        onChange={(e) => updateItemResult(item.id, 'condition', e.target.value)}
                        disabled={result.saved}
                        options={['OK', 'Not OK']}
                      />
                    </Field>
                    <Field label="Observation">
                      <TextInput
                        value={result.observation ?? ''}
                        onChange={(e) => updateItemResult(item.id, 'observation', e.target.value)}
                        disabled={result.saved}
                      />
                    </Field>
                    <Field label="Action Taken">
                      <TextInput
                        value={result.action_taken ?? ''}
                        onChange={(e) => updateItemResult(item.id, 'action_taken', e.target.value)}
                        disabled={result.saved}
                      />
                    </Field>
                    <span className={`pb-2 text-xs font-medium ${result.saved ? 'text-green-700' : 'text-gray-400'}`}>
                      {result.saved ? 'Saved' : 'Not saved'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {editingLog && (
          <VisitEditPanel
            typeOptions={maintenanceTypeOptions}
            log={editingLog}
            machines={machines}
            employees={employees}
            shifts={shifts}
            onSave={handleSaveEdit}
            onCancel={() => setEditingLog(null)}
          />
        )}

        <RecordsList
          title="Recent Maintenance Visits"
          columns={[...logColumns, EDITED_COLUMN]}
          rows={filteredRecentLogs}
          loading={loading}
          rowKey="id"
          selectedKey={selectedLog?.id}
          onRowClick={(r) => !editingLog && setSelectedLog(r)}
          searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search by Machine ID..." />
      </div>
    </div>
  )
}

/** Supervisor/admin correction of one saved visit: Engineer, Shift, Type and
 * each saved checklist item's Condition / Observation / Action Taken.
 * Machine and Date stay as saved (the DB refuses changing them, 032).
 * onSave(header, items, originalItems) returns an error or null. */
function VisitEditPanel({ log, machines, employees, shifts, typeOptions, onSave, onCancel }) {
  const [header, setHeader] = useState({ employee_id: log.employee_id ?? '', shift_code: log.shift_code ?? '', maintenance_type: log.maintenance_type ?? '' })
  const [original, setOriginal] = useState([])
  const [items, setItems] = useState([])
  const [names, setNames] = useState(new Map())
  const [loadingItems, setLoadingItems] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    Promise.all([listMaintenanceLogItems(log.id), listChecklistItemsForMachine(log.machine_id)])
      .then(([rows, checklist]) => {
        if (!active) return
        setOriginal(rows)
        setItems(rows.map((r) => ({ ...r, observation: r.observation ?? '', action_taken: r.action_taken ?? '' })))
        setNames(new Map(checklist.map((c) => [c.id, c.checklist_item])))
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoadingItems(false))
    return () => {
      active = false
    }
  }, [log])

  const setItem = (id, key, value) => setItems((list) => list.map((x) => (x.id === id ? { ...x, [key]: value } : x)))

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const message = await onSave(header, items, original)
      if (message) setError(message)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const machine = machines.find((m) => m.machine_id === log.machine_id)

  return (
    <FormSection icon={Pencil} title="Edit Maintenance Visit" subtitle="Supervisor / admin correction -- recorded with who and when" columns={4}>
      {error && <Banner tone="error" message={error} />}
      <Field label="Machine">
        <TextInput value={machine ? machineOptionLabel(machine) : log.machine_id} disabled />
      </Field>
      <Field label="Date">
        <TextInput value={log.log_date ?? ''} disabled />
      </Field>
      <Field label="Maintenance Engineer" required>
        <EmployeeSelect employees={employees} value={header.employee_id} onChange={(e) => setHeader((h) => ({ ...h, employee_id: e.target.value }))} />
      </Field>
      <Field label="Shift" required>
        <SelectInput value={header.shift_code} onChange={(e) => setHeader((h) => ({ ...h, shift_code: e.target.value }))} options={shifts.map((s) => s.shift_code)} />
      </Field>
      <Field label="Type of Maintenance">
        <SelectWithAddNew value={header.maintenance_type} onChange={(e) => setHeader((h) => ({ ...h, maintenance_type: e.target.value }))} options={typeOptions} />
      </Field>
      <div className="sm:col-span-4 divide-y divide-gray-100 rounded border border-gray-200 bg-white">
        {loadingItems ? (
          <p className="p-3 text-sm text-gray-400">Loading checklist items...</p>
        ) : items.length === 0 ? (
          <p className="p-3 text-sm text-gray-400">No checklist items were saved on this visit.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="grid grid-cols-1 sm:grid-cols-4 gap-2 p-3 items-end">
              <p className="text-sm font-medium text-gray-700">{names.get(item.checklist_item_id) ?? `Item ${item.checklist_item_id}`}</p>
              <Field label="Condition">
                <SelectInput value={item.condition} onChange={(e) => setItem(item.id, 'condition', e.target.value)} options={['OK', 'Not OK']} />
              </Field>
              <Field label="Observation">
                <TextInput value={item.observation} onChange={(e) => setItem(item.id, 'observation', e.target.value)} />
              </Field>
              <Field label="Action Taken">
                <TextInput value={item.action_taken} onChange={(e) => setItem(item.id, 'action_taken', e.target.value)} />
              </Field>
            </div>
          ))
        )}
      </div>
      <div className="sm:col-span-4 flex items-center gap-2 pt-1">
        <button type="button" onClick={handleSave} disabled={saving || loadingItems} className="rounded bg-bmlhblue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700">
          Cancel
        </button>
      </div>
    </FormSection>
  )
}
