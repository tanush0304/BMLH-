import { useState } from 'react'
import ActionToolbar from '../../../components/ActionToolbar'
import { exportToCsv, exportToPdf } from '../../../utils/exportUtils'
import { createComplaint, uploadComplaintAttachments } from '../../../data/queries/customerComplaints'
import { emptyComplaintForm, filterComplaintRows, registrationPayload, validateRegistration } from '../../../utils/customerComplaints'
import ComplaintRegistrationSections from './ComplaintRegistrationSections'
import ComplaintList, { COMPLAINT_EXPORT_COLUMNS } from './ComplaintList'
import useComplaintData from './useComplaintData'

/** Registration tab of Customer Complaint -- registers a complaint
 * (sections 1-3); it is saved as 'Open'. Investigation and closure happen on
 * the Investigation & Closure tab (onOpenComplaint). */
export default function ComplaintRegistrationScreen({ onOpenComplaint }) {
  const data = useComplaintData()
  const [form, setForm] = useState(() => emptyComplaintForm())
  const [newFiles, setNewFiles] = useState([])
  const [fileInputKey, setFileInputKey] = useState(0)
  const [savedNo, setSavedNo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  function handleChange(patch) {
    setForm((f) => ({ ...f, ...patch }))
    setSavedNo('')
  }

  function handleClear() {
    setForm(emptyComplaintForm())
    setNewFiles([])
    setFileInputKey((k) => k + 1)
    setSavedNo('')
    setError(null)
  }

  async function handleSave() {
    const problem = validateRegistration(form)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const saved = await createComplaint(registrationPayload(form))
      try {
        if (newFiles.length) await uploadComplaintAttachments(saved, newFiles)
      } catch (e) {
        setError(`Complaint ${saved.complaint_no} was saved, but a file could not be uploaded: ${e.message}`)
      }
      handleClear()
      setSavedNo(saved.complaint_no)
      await data.refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const rows = filterComplaintRows(data.rows, search)

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <ActionToolbar
        showEditDelete={false}
        saving={saving}
        onNew={handleClear}
        onSave={handleSave}
        onClear={handleClear}
        onExportExcel={() => exportToCsv(COMPLAINT_EXPORT_COLUMNS, rows, 'customer_complaints.csv')}
        onExportPdf={() => exportToPdf(COMPLAINT_EXPORT_COLUMNS, rows, 'Customer Complaints', 'customer_complaints')}
      />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {(error || data.error) && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error || data.error}</div>
        )}
        {savedNo && !error && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded">
            Complaint {savedNo} registered (status Open).
          </div>
        )}

        <ComplaintRegistrationSections
          key={fileInputKey}
          form={form}
          onChange={handleChange}
          complaintNo={savedNo}
          customers={data.customers}
          products={data.products}
          sourceOptions={data.sourceOptions}
          defectOptions={data.defectOptions}
          newFiles={newFiles}
          onNewFilesChange={setNewFiles}
        />

        <ComplaintList
          rows={rows}
          loading={data.loading}
          search={search}
          onSearchChange={setSearch}
          onRowClick={(row) => onOpenComplaint?.(row.complaint_no)}
        />
      </div>
    </div>
  )
}
