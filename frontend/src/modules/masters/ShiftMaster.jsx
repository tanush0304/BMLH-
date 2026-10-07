import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, AutoFillBox } from '../../components/FormSection'
import TimeInput12 from '../../components/TimeInput12'
import RecordsList from '../../components/RecordsList'
import { listShifts, createShift, updateShift, deleteShift } from '../../data/queries/shifts'
import { computeShiftHours } from '../../utils/shiftCalculations'

// Shift Duration / Net Working Hours used to be typed in by hand; they're
// now always derived from start_time/end_time/lunch_break_duration via
// computeShiftHours (see utils/shiftCalculations.js for the pure logic and
// its unit tests) -- hence the bespoke screen instead of the generic
// MasterFormScreen, which has no way to express a field computed live from
// other fields plus inline warnings/errors that block save.
const EMPTY_FORM = {
  shift_code: '',
  shift_name: '',
  start_time: '',
  end_time: '',
  lunch_break_duration: '',
  shift_duration: '',
  net_working_hours: '',
}

const LIST_COLUMNS = [
  { key: 'shift_code', label: 'Shift Code' },
  { key: 'shift_name', label: 'Shift Name' },
  { key: 'start_time', label: 'Start Time' },
  { key: 'end_time', label: 'End Time' },
  { key: 'net_working_hours', label: 'Net Working Hours' },
]

export default function ShiftMaster() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [listSearch, setListSearch] = useState('')
  const [toolbarSearch, setToolbarSearch] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [mode, setMode] = useState('new')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [staleStoredNote, setStaleStoredNote] = useState(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      setRecords(await listShifts())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const readOnly = mode === 'view'
  const pkLocked = mode !== 'new'

  const computed = computeShiftHours({
    start_time: form.start_time,
    end_time: form.end_time,
    lunch_break_duration: form.lunch_break_duration,
  })

  function handleField(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  function handleNew() {
    setForm(EMPTY_FORM)
    setMode('new')
    setSaveError(null)
    setStaleStoredNote(null)
  }

  function handleClear() {
    setForm(EMPTY_FORM)
    setMode('new')
    setSaveError(null)
    setStaleStoredNote(null)
  }

  function handleRowClick(row) {
    setForm({ ...EMPTY_FORM, ...row })
    setMode('view')
    setSaveError(null)

    const recomputed = computeShiftHours({
      start_time: row.start_time,
      end_time: row.end_time,
      lunch_break_duration: row.lunch_break_duration,
    })
    const diffs = []
    if (recomputed.shift_duration && recomputed.shift_duration !== row.shift_duration) {
      diffs.push(`Shift Duration: stored "${row.shift_duration}", calculated "${recomputed.shift_duration}"`)
    }
    if (recomputed.net_working_hours && recomputed.net_working_hours !== row.net_working_hours) {
      diffs.push(`Net Working Hours: stored "${row.net_working_hours}", calculated "${recomputed.net_working_hours}"`)
    }
    setStaleStoredNote(diffs.length ? `${row.shift_code} -- ${diffs.join('; ')}` : null)
  }

  function handleEdit() {
    if (!form.shift_code) return
    setMode('edit')
  }

  async function handleSave() {
    if (!form.shift_code || !form.shift_name) {
      setSaveError('Shift Code and Shift Name are required.')
      return
    }
    if (computed.error) {
      setSaveError(computed.error)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = {
        shift_code: form.shift_code,
        shift_name: form.shift_name,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        lunch_break_duration: form.lunch_break_duration || null,
        shift_duration: computed.shift_duration || null,
        net_working_hours: computed.net_working_hours || null,
      }
      if (mode === 'edit') {
        await updateShift(form.shift_code, payload)
      } else {
        await createShift(payload)
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
    if (!form.shift_code) return
    if (!confirm(`Delete this shift (${form.shift_code})? This cannot be undone.`)) return
    setSaving(true)
    setSaveError(null)
    try {
      await deleteShift(form.shift_code)
      await refresh()
      handleClear()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleExportExcel() {
    exportToCsv(LIST_COLUMNS, filteredRecords, 'shift_master.csv')
  }

  function handleExportPdf() {
    exportToPdf(LIST_COLUMNS, filteredRecords, 'Shift Master', 'shift_master')
  }

  function handleToolbarSearch() {
    setListSearch(toolbarSearch)
  }

  const filteredRecords = records.filter((r) => {
    if (!listSearch) return true
    const q = listSearch.toLowerCase()
    return r.shift_code?.toLowerCase().includes(q) || r.shift_name?.toLowerCase().includes(q)
  })

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Shift Master" subtitle="Manage Shift Schedules  |  Working Hours & Breaks" />
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
        searchPlaceholder="Search..."
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      />

      <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-1.5 bg-[#F5F7FA]">
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{saveError}</div>
        )}
        {!saveError && computed.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{computed.error}</div>
        )}
        {computed.warning && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-2 rounded">
            {computed.warning}
          </div>
        )}
        {computed.message && (
          <div className="bg-gray-100 border border-gray-200 text-gray-600 text-sm px-4 py-2 rounded">
            {computed.message}
          </div>
        )}
        {staleStoredNote && (
          <div className="bg-sky-50 border border-sky-200 text-sky-800 text-sm px-4 py-2 rounded">
            Stored value differs from calculated -- showing calculated. {staleStoredNote}
          </div>
        )}

        <FormSection icon={Clock} title="1. Shift Details" subtitle="Working hours and break schedule">
          <Field label="Shift Code" required width="short">
            <TextInput
              value={form.shift_code}
              onChange={handleField('shift_code')}
              disabled={readOnly || pkLocked}
            />
          </Field>
          <Field label="Shift Name" required width="medium">
            <TextInput value={form.shift_name} onChange={handleField('shift_name')} disabled={readOnly} />
          </Field>
          <Field label="Start Time" width="medium">
            <TimeInput12 value={form.start_time} onChange={handleField('start_time')} disabled={readOnly} />
          </Field>
          <Field label="End Time" width="medium">
            <TimeInput12 value={form.end_time} onChange={handleField('end_time')} disabled={readOnly} />
          </Field>
          <Field label="Lunch Break Duration" width="short">
            <TextInput
              value={form.lunch_break_duration}
              onChange={handleField('lunch_break_duration')}
              disabled={readOnly}
              placeholder="e.g. 30 min"
            />
          </Field>
          <Field label="Shift Duration" width="short">
            <AutoFillBox value={computed.shift_duration} />
          </Field>
          <Field label="Net Working Hours" width="short">
            <AutoFillBox value={computed.net_working_hours} />
          </Field>
        </FormSection>

        <RecordsList
          title="Shift Master List"
          columns={LIST_COLUMNS}
          rows={filteredRecords}
          loading={loading}
          error={error}
          rowKey="shift_code"
          selectedKey={form.shift_code}
          onRowClick={handleRowClick}
          searchValue={listSearch}
          onSearchChange={setListSearch}
        />
      </div>
    </div>
  )
}
