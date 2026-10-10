import RecordsList from '../../../components/RecordsList'

// RecordsList numbers rows itself (S.No); the export adds Sl No.
export const COMPLAINT_LIST_COLUMNS = [
  { key: 'complaint_no', label: 'Complaint No' },
  { key: 'complaint_date', label: 'Date' },
  { key: 'customer_name', label: 'Customer' },
  { key: 'part_label', label: 'Part' },
  { key: 'qty_complained', label: 'Qty Complained' },
  { key: 'defect_problem', label: 'Defect' },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status', type: 'status' },
  { key: 'closure_date', label: 'Closure Date' },
]

export const COMPLAINT_EXPORT_COLUMNS = [{ key: 'sl_no', label: 'Sl No' }, ...COMPLAINT_LIST_COLUMNS]

/** Complaint List shared by both complaint screens; a row click opens it in
 * Investigation & Closure. */
export default function ComplaintList({ rows, loading, error, search, onSearchChange, selectedKey, onRowClick }) {
  return (
    <RecordsList
      title="Complaint List"
      columns={COMPLAINT_LIST_COLUMNS}
      rows={rows}
      loading={loading}
      error={error}
      rowKey="complaint_no"
      selectedKey={selectedKey}
      onRowClick={onRowClick}
      searchValue={search}
      onSearchChange={onSearchChange}
      searchPlaceholder="Search by Complaint No / Customer / Part / Status / Date..."
    />
  )
}
