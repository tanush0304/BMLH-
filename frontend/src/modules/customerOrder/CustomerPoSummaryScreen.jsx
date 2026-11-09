import { useEffect, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import RecordsList from '../../components/RecordsList'
import { listPoSummary, listOrdersForPoHeader } from '../../data/queries/customerPoHeaders'
import Banner from '../../components/Banner'
import { useDeliveryAddresses } from '../../utils/useDeliveryAddresses'
import { deliveryText } from '../../utils/deliveryAddress'
import { openPoSupported, listLineStatuses } from '../../data/queries/openPo'

const PO_COLUMNS = [
  { key: 'po_number', label: 'PO Number' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'po_date', label: 'PO Date' },
  { key: 'line_item_count', label: 'Line Items' },
  { key: 'total_order_qty', label: 'Total Order Qty' },
  { key: 'po_status', label: 'PO Status', type: 'status', needsOpenPo: true },
  { key: 'valid_from', label: 'Valid From', needsOpenPo: true },
  { key: 'valid_to', label: 'Valid To', needsOpenPo: true },
  { key: 'line_counts', label: 'Lines (Open / Closed / Cancelled)', needsOpenPo: true },
]

const LINE_COLUMNS = [
  { key: 'prd_no', label: 'PRDs' },
  { key: 'part_serial_number', label: 'Part Serial Number' },
  { key: 'order_type', label: 'Order Type' },
  { key: 'deliver_to', label: 'Deliver To', needsAddresses: true },
  { key: 'order_qty', label: 'Order Qty' },
  { key: 'expected_delivery', label: 'Expected Delivery' },
  { key: 'line_status', label: 'Line Status', type: 'status', needsOpenPo: true },
  { key: 'despatched_qty', label: 'Despatched', needsOpenPo: true },
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
  const delivery = useDeliveryAddresses() // 042; Deliver To hidden before it
  // 043: PO status / validity / line counts (from "customer po summary") and line status
  const [openPo, setOpenPo] = useState(false)
  const [lineStatus, setLineStatus] = useState(new Map())
  useEffect(() => {
    let active = true
    openPoSupported().then(async (ok) => {
      if (!active) return
      setOpenPo(ok)
      if (ok) {
        const rows = await listLineStatuses().catch(() => [])
        if (active) setLineStatus(new Map(rows.map((x) => [x.order_line_id, x])))
      }
    })
    return () => {
      active = false
    }
  }, [expandedId])
  const poColumns = PO_COLUMNS.filter((c) => !c.needsOpenPo || openPo)
  const lineColumns = LINE_COLUMNS.filter((c) => (!c.needsAddresses || delivery.supported) && (!c.needsOpenPo || openPo))
  const lineRows = lineItems.map((l) => ({
    ...l,
    deliver_to: deliveryText(l, delivery.byId),
    line_status: lineStatus.get(l.order_line_id)?.line_status ?? '',
    despatched_qty: lineStatus.get(l.order_line_id)?.despatched_qty ?? '',
  }))

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

  const filtered = headers.map((h) => ({ ...h, line_counts: h.open_lines == null ? '' : `${h.open_lines} / ${h.closed_lines} / ${h.cancelled_lines}` })).filter((h) => {
    if (!search) return true
    const q = search.toLowerCase()
    return h.po_number?.toLowerCase().includes(q) || h.customer_id?.toLowerCase().includes(q)
  })

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Customer PO Summary" subtitle="One Row Per Real Customer PO  |  Expand For Line Items" />
      <ActionToolbar
        showCrudButtons={false}
        onExportExcel={() => exportToCsv(poColumns, filtered, 'customer_po_summary.csv')}
        onExportPdf={() => exportToPdf(poColumns, filtered, 'Customer PO Summary', 'customer_po_summary')}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <Banner tone="error" message={error} />
        )}

        <RecordsList
          title="Customer POs"
          columns={poColumns}
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
            columns={lineColumns}
            rows={lineRows}
            loading={lineLoading}
            error={null}
            rowKey="order_line_id"
          />
        )}
      </div>
    </div>
  )
}
