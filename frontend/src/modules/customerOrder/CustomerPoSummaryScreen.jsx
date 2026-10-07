import { useEffect, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import RecordsList from '../../components/RecordsList'
import { listPoSummary, listOrdersForPoHeader } from '../../data/queries/customerPoHeaders'

const PO_COLUMNS = [
  { key: 'po_number', label: 'PO Number' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'po_date', label: 'PO Date' },
  { key: 'line_item_count', label: 'Line Items' },
  { key: 'total_order_qty', label: 'Total Order Qty' },
]

const LINE_COLUMNS = [
  { key: 'prd_no', label: 'PRD No' },
  { key: 'part_serial_number', label: 'Part Serial Number' },
  { key: 'order_type', label: 'Order Type' },
  { key: 'order_qty', label: 'Order Qty' },
  { key: 'expected_delivery', label: 'Expected Delivery' },
]

/**
 * One row per real customer PO (e.g. a Schedule Agreement with many line
 * items), built from the "customer po summary" view -- only POs created
 * through the new two-level Customer Orders flow show up here, since the
 * view is derived from customer_orders.parent_po_id. Older flat orders
 * (no parent_po_id) aren't part of any PO group, so they correctly don't
 * appear here at all -- they still show fine in Customer Orders' own list.
 */
export default function CustomerPoSummaryScreen() {
  const [headers, setHeaders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [lineLoading, setLineLoading] = useState(false)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      setHeaders(await listPoSummary())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleRowClick(row) {
    setExpandedId(row.po_header_id)
    setLineLoading(true)
    try {
      setLineItems(await listOrdersForPoHeader(row.po_header_id))
    } catch (e) {
      setError(e.message)
    } finally {
      setLineLoading(false)
    }
  }

  const filtered = headers.filter((h) => {
    if (!search) return true
    const q = search.toLowerCase()
    return h.po_number?.toLowerCase().includes(q) || h.customer_id?.toLowerCase().includes(q)
  })

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Customer PO Summary" subtitle="One Row Per Real Customer PO  |  Expand For Line Items" />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>
        )}

        <RecordsList
          title="Customer POs"
          columns={PO_COLUMNS}
          rows={filtered}
          loading={loading}
          error={null}
          rowKey="po_header_id"
          selectedKey={expandedId}
          onRowClick={handleRowClick}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by PO Number / Customer..."
        />

        {expandedId && (
          <RecordsList
            title={`Line Items -- PO Header #${expandedId}`}
            columns={LINE_COLUMNS}
            rows={lineItems}
            loading={lineLoading}
            error={null}
            rowKey="prd_no"
          />
        )}
      </div>
    </div>
  )
}
