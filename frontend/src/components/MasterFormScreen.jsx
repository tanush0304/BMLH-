import { useEffect, useState } from 'react'
import PageHeader from './PageHeader'
import ActionToolbar from './ActionToolbar'
import FormSection, { Field, TextInput, SelectInput } from './FormSection'
import RecordsList from './RecordsList'

/**
 * Generic New/Save/Edit/Delete/Clear master-data screen, config-driven so
 * every master table reuses the same shell instead of re-implementing it.
 *
 * api: { list, create, update(pk, payload), remove(pk) }
 * sections: [{ icon, title, columns, fields: [{ key, label, required, type, options, colSpan }] }]
 * listColumns: RecordsList column config
 * searchFields: form fields the toolbar search box matches against (client-side)
 */
export default function MasterFormScreen({
  title,
  subtitle,
  pkField,
  emptyForm,
  sections,
  listColumns,
  searchFields,
  api,
  exportFilename,
}) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [listSearch, setListSearch] = useState('')
  const [toolbarSearch, setToolbarSearch] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [mode, setMode] = useState('new') // 'new' | 'edit' | 'view'
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    setForm(emptyForm)
    setMode('new')
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title])

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      setRecords(await api.list())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleField(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  function handleNew() {
    setForm(emptyForm)
    setMode('new')
    setSaveError(null)
  }

  function handleClear() {
    setForm(emptyForm)
    setMode('new')
    setSaveError(null)
  }

  function handleRowClick(row) {
    setForm({ ...emptyForm, ...row })
    setMode('view')
    setSaveError(null)
  }

  function handleEdit() {
    if (!form[pkField]) return
    setMode('edit')
  }

  async function handleSave() {
    const missing = sections
      .flatMap((s) => s.fields)
      .find((f) => f.required && !form[f.key])
    if (missing) {
      setSaveError(`${missing.label} is required.`)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = { ...form }
      sections.flatMap((s) => s.fields).forEach((f) => {
        if (f.type === 'boolean') payload[f.key] = form[f.key] === 'true'
        if (f.type === 'number' && payload[f.key] === '') payload[f.key] = null
      })
      if (mode === 'edit') {
        await api.update(form[pkField], payload)
      } else {
        await api.create(payload)
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
    if (!form[pkField]) return
    if (!confirm(`Delete this record (${form[pkField]})? This cannot be undone.`)) return
    setSaving(true)
    setSaveError(null)
    try {
      await api.remove(form[pkField])
      await refresh()
      handleClear()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleExport() {
    const header = listColumns.map((c) => c.label).join(',')
    const rows = filteredRecords.map((r) => listColumns.map((c) => r[c.key] ?? '').join(','))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = exportFilename ?? 'export.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleToolbarSearch() {
    setListSearch(toolbarSearch)
  }

  const filteredRecords = records.filter((r) => {
    if (!listSearch) return true
    const q = listSearch.toLowerCase()
    return searchFields.some((key) => String(r[key] ?? '').toLowerCase().includes(q))
  })

  const readOnly = mode === 'view'
  const pkLocked = mode !== 'new'

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader title={title} subtitle={subtitle} />
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
        onExport={handleExport}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#F5F7FA]">
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {saveError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {sections.map((section) => (
            <FormSection
              key={section.title}
              icon={section.icon}
              title={section.title}
              columns={section.columns ?? 2}
            >
              {section.fields.map((f) => (
                <Field key={f.key} label={f.label} required={f.required} className={f.colSpan}>
                  {f.type === 'select' ? (
                    <SelectInput
                      value={form[f.key] ?? ''}
                      onChange={handleField(f.key)}
                      disabled={readOnly || (f.lockOnEdit && pkLocked)}
                      options={f.options}
                    />
                  ) : (
                    <TextInput
                      type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'}
                      value={form[f.key] ?? ''}
                      onChange={handleField(f.key)}
                      disabled={readOnly || (f.lockOnEdit && pkLocked)}
                    />
                  )}
                </Field>
              ))}
            </FormSection>
          ))}
        </div>

        <RecordsList
          title={`${title} List`}
          columns={listColumns}
          rows={filteredRecords}
          loading={loading}
          error={error}
          rowKey={pkField}
          selectedKey={form[pkField]}
          onRowClick={handleRowClick}
          searchValue={listSearch}
          onSearchChange={setListSearch}
        />
      </div>
    </div>
  )
}
