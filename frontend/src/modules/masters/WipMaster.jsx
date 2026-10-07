import ReadOnlyMasterView from './ReadOnlyMasterView'
import { listWipMaster } from '../../data/queries/storeMasters'

const COLUMNS = [
  { key: 'prd_no', label: 'PRD Number' },
  { key: 'part_serial_number', label: 'Part Serial Number' },
  { key: 'part_name', label: 'Part Name' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'unit_of_measurement', label: 'UoM' },
  { key: 'order_type', label: 'Order Type' },
  { key: 'order_quantity', label: 'Order Quantity', numeric: true },
  { key: 'stage_seq', label: 'Stage Seq', numeric: true },
  { key: 'nature_of_operation_completed', label: 'Nature of Operation Completed' },
  { key: 'wip_opening_stock', label: 'WIP Opening Stock', numeric: true },
  { key: 'wip_receipts', label: 'WIP Receipts', numeric: true },
  { key: 'wip_issued', label: 'WIP Issued', numeric: true },
  { key: 'total_available_wip_quantity', label: 'Total Available WIP Quantity', numeric: true },
]

export default function WipMaster() {
  return (
    <ReadOnlyMasterView
      title="WIP Master"
      subtitle="Work in progress by production order and route stage"
      loadRows={listWipMaster}
      columns={COLUMNS}
    />
  )
}
