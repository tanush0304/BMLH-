import { useEffect, useState } from 'react'
import { Wrench, ClipboardCheck } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import { listMachines } from '../../data/queries/machines'
import { listUsers } from '../../data/queries/users'
import { machineOptionLabel } from '../../utils/machineLabel'
import { listShifts } from '../../data/queries/shifts'
import {
  listChecklistItemsForMachine,
  createMaintenanceLog,
  addMaintenanceLogItem,
  listRecentMaintenanceLogs,
} from '../../data/queries/maintenanceLogs'

const LOG_COLUMNS = [
  { key: 'machine_id', label: 'Machine ID' },
  { key: 'user_emp_id', label: 'Engineer' },
  { key: 'shift_code', label: 'Shift' },
  { key: 'log_date', label: 'Date' },
]

export default function ChecklistEntryScreen() {
  const [machines, setMachines] = useState([])
  const [users, setUsers] = useState([])
  const [shifts, setShifts] = useState([])
  const [recentLogs, setRecentLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [machineId, setMachineId] = useState('')
  const [userId, setUserId] = useState('')
  const [shiftCode, setShiftCode] = useState('')
  const [logDate, setLogDate] = useState('')
  const [checklistItems, setChecklistItems] = useState([])
  const [activeLog, setActiveLog] = useState(null)
  const [itemResults, setItemResults] = useState({})
  const [starting, setStarting] = useState(false)
  const [savingItemId, setSavingItemId] = useState(null)
  const [search, setSearch] = useState('')

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [machs, usrs, shf, logs] = await Promise.all([
        listMachines(),
        listUsers(),
        listShifts(),
        listRecentMaintenanceLogs(),
      ])
      setMachines(machs)
      setUsers(usrs)
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
    if (!machineId || !userId || !shiftCode || !logDate) {
      setError('Machine, Engineer, Shift and Date are all required to start a visit.')
      return
    }
    setStarting(true)
    setError(null)
    try {
      const log = await createMaintenanceLog({
        machine_id: machineId,
        user_emp_id: userId,
        shift_code: shiftCode,
        log_date: logDate,
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

  async function handleSaveItem(itemId) {
    const result = itemResults[itemId] ?? {}
    if (!result.condition) {
      setError('Pick OK / Not OK before saving a checklist item.')
      return
    }
    setSavingItemId(itemId)
    setError(null)
    try {
      await addMaintenanceLogItem({
        maintenance_log_id: activeLog.id,
        checklist_item_id: itemId,
        condition: result.condition,
        observation: result.observation || null,
        action_taken: result.action_taken || null,
      })
      updateItemResult(itemId, 'saved', true)
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingItemId(null)
    }
  }

  const filteredRecentLogs = recentLogs.filter((l) => {
    if (!search) return true
    return l.machine_id?.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Maintenance Checklist Entry" subtitle="One Visit, Several Checklist Items" />
      <ActionToolbar
        showCrudButtons={false}
        searchValue={search}
        onSearchChange={setSearch}
        onSearch={() => {}}
        searchPlaceholder="Search by Machine ID..."
        showExport={false}
      />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}

        <FormSection icon={Wrench} title="1. Visit Details" subtitle="Maintenance visit and machine" columns={4}>
          <Field label="Machine" required>
            <SelectInput value={machineId} onChange={handleMachineChange} disabled={!!activeLog} options={machines.map((m) => ({ value: m.machine_id, label: machineOptionLabel(m) }))} />
          </Field>
          <Field label="Maintenance Engineer" required>
            <SelectInput value={userId} onChange={(e) => setUserId(e.target.value)} disabled={!!activeLog} options={users.map((o) => o.user_emp_id)} />
          </Field>
          <Field label="Shift" required>
            <SelectInput value={shiftCode} onChange={(e) => setShiftCode(e.target.value)} disabled={!!activeLog} options={shifts.map((s) => s.shift_code)} />
          </Field>
          <Field label="Date" required>
            <TextInput type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} disabled={!!activeLog} />
          </Field>
          <div className="flex items-end">
            <button
              onClick={handleStartVisit}
              disabled={starting || !!activeLog}
              className="bg-green-600 text-white rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-green-700"
            >
              {activeLog ? 'Visit Started' : starting ? 'Starting...' : 'Start Visit'}
            </button>
          </div>
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
                    <button
                      onClick={() => handleSaveItem(item.id)}
                      disabled={result.saved || savingItemId === item.id}
                      className="bg-bmlhblue text-white rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                    >
                      {result.saved ? 'Saved' : 'Save'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <RecordsList title="Recent Maintenance Visits" columns={LOG_COLUMNS} rows={filteredRecentLogs} loading={loading} rowKey="id" />
      </div>
    </div>
  )
}
