import ReadOnlyMasterView from './ReadOnlyMasterView'
import { listFinishedGoodsMaster } from '../../data/queries/storeMasters'

const COLUMNS = [
  { key: 'prd_no', label: 'PRD Number' },
  { key: 'part_serial_number', label: 'Part Serial Number' },
  { key: 'part_name', label: 'Part Name' },
  { key: 'part_drawing_reference_number', label: 'Part Drawing Number' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'unit_of_measurement', label: 'UoM' },
  { key: 'order_type', label: 'Order Type' },
  { key: 'order_quantity', label: 'Order Quantity', numeric: true },
  { key: 'opening_stock', label: 'Opening Stock', numeric: true },
  { key: 'receipts', label: 'Receipts', numeric: true },
  { key: 'units_ready_to_despatch', label: 'No. Units Ready to Dispatch', numeric: true },
  { key: 'quantity_despatched', label: 'Quantity Dispatched', numeric: true },
  { key: 'balance_to_be_despatched', label: 'Balance to be Dispatched', numeric: true },
]

export default function FinishedGoodsMaster() {
  return (
    <ReadOnlyMasterView
      title="Finished Goods Master"
      subtitle="Finished goods quantities by production order"
      loadRows={listFinishedGoodsMaster}
      columns={COLUMNS}
      rowKey="prd_no"
    />
  )
}
