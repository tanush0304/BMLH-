import { useEffect, useState } from 'react'
import { Route } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import {
  listCycleTimes,
  createCycleTime,
  updateCycleTime,
  deleteCycleTime,
} from '../../data/queries/cycleTimes'
import { listProducts } from '../../data/queries/products'
import { listMachines } from '../../data/queries/machines'
import { listJobWorkTypes } from '../../data/queries/jobWorkTypes'

const EMPTY_FORM = {
  id: '',
  product_code: '',
  operation: '',
  seq: '',
  type: '',
  machine_id: '',
  cycle_time_min: '',
  job_work_code: '',
}

const LIST_COLUMNS = [
  { key: 'product_code', label: 'Product Code' },
  { key: 'seq', label: 'Seq' },
  { key: 'operation', label: 'Operation' },
  { key: 'type', label: 'Type' },
  { key: 'machine_id', label: 'Machine ID' },
  { key: 'job_work_code', label: 'Job Work Code' },
  { key: 'cycle_time_min', label: 'Cycle Time (min)' },
]

export default function CycleTimeMaster() {
  const [records, setRecords] = useState([])
  const [products, setProducts] = useState([])
  const [machines, setMachines] = useState([])
  const [jobWorkTypes, setJobWorkTypes] = useState([])
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
      const [cycleTimes, prods, machs, jwts] = await Promise.all([
        listCycleTimes(),
        listProducts(),
        listMachines(),
        listJobWorkTypes(),
      ])
      setRecords(cycleTimes)
      setProducts(prods)
      setMachines(machs)
      setJobWorkTypes(jwts)
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

  function handleTypeChange(e) {
    const type = e.target.value
    setForm((f) => ({
      ...f,
      type,
      machine_id: type === 'Internal' ? f.machine_id : '',
      job_work_code: type === 'Outsourced' ? f.job_work_code : '',
    }))
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
    if (!form.product_code || !form.operation || !form.seq || !form.type) {
      setSaveError('Product, Operation, Seq and Type are required.')
      return
    }
    if (form.type === 'Internal' && !form.machine_id) {
      setSaveError('Machine is required for an Internal step.')
      return
    }
    if (form.type === 'Outsourced' && !form.job_work_code) {
      setSaveError('Job Work Type is required for an Outsourced step.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = {
        product_code: form.product_code,
        operation: form.operation,
        seq: Number(form.seq),
        type: form.type,
        machine_id: form.type === 'Internal' ? form.machine_id : null,
        job_work_code: form.type === 'Outsourced' ? form.job_work_code : null,
        cycle_time_min: form.cycle_time_min === '' ? null : Number(form.cycle_time_min),
      }
      if (mode === 'edit') {
        await updateCycleTime(form.id, payload)
      } else {
        await createCycleTime(payload)
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
    if (!confirm(`Delete this cycle time row (id ${form.id})? This cannot be undone.`)) return
    setSaving(true)
    setSaveError(null)
    try {
      await deleteCycleTime(form.id)
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
    a.download = 'cycle_time_master.csv'
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
      r.product_code?.toLowerCase().includes(q) || r.operation?.toLowerCase().includes(q)
    )
  })

  const readOnly = mode === 'view'

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader
        title="Cycle Time Master"
        subtitle="Manage Production Routes  |  Product + Operation + Machine / Job Work"
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
        searchPlaceholder="Search by Product Code / Operation..."
        onExport={handleExport}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F5F7FA]">
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {saveError}
          </div>
        )}

        <FormSection icon={Route} title="1. Route Step Details" columns={3}>
          <Field label="Product Code" required>
            <SelectInput
              value={form.product_code}
              onChange={handleField('product_code')}
              disabled={readOnly}
              options={products.map((p) => p.product_code)}
            />
          </Field>
          <Field label="Sequence" required>
            <TextInput type="number" value={form.seq} onChange={handleField('seq')} disabled={readOnly} />
          </Field>
          <Field label="Operation" required>
            <TextInput value={form.operation} onChange={handleField('operation')} disabled={readOnly} />
          </Field>
          <Field label="Type" required>
            <SelectInput
              value={form.type}
              onChange={handleTypeChange}
              disabled={readOnly}
              options={['Internal', 'Outsourced', 'Manual']}
            />
          </Field>
          {form.type === 'Internal' && (
            <Field label="Machine" required>
              <SelectInput
                value={form.machine_id}
                onChange={handleField('machine_id')}
                disabled={readOnly}
                options={machines.map((m) => m.machine_id)}
              />
            </Field>
          )}
          {form.type === 'Outsourced' && (
            <Field label="Job Work Type" required>
              <SelectInput
                value={form.job_work_code}
                onChange={handleField('job_work_code')}
                disabled={readOnly}
                options={jobWorkTypes.map((j) => j.job_work_code)}
              />
            </Field>
          )}
          <Field label="Cycle Time (min)">
            <TextInput
              type="number"
              value={form.cycle_time_min}
              onChange={handleField('cycle_time_min')}
              disabled={readOnly}
            />
          </Field>
        </FormSection>

        <RecordsList
          title="Cycle Time Master List"
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
