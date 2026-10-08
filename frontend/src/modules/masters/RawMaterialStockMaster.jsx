import ReadOnlyMasterView from './ReadOnlyMasterView'
import { listRawMaterialStockMaster } from '../../data/queries/storeMasters'

// One row per raw material x BOM part (view "raw material stock master",
// migration 023); a material with no BOM has one row with a blank part.
const COLUMNS = [
  { key: 'raw_material_code', label: 'Raw Material Code' },
  { key: 'raw_material_name', label: 'Raw Material Name' },
  { key: 'supplier_names', label: 'Supplier Name' },
  { key: 'raw_material_category', label: 'Raw Material Category' },
  { key: 'rm_type', label: 'Raw Material Type' },
  { key: 'unit_of_measurement', label: 'Unit count' },
  { key: 'rm_source', label: 'Raw Material Source' },
  { key: 'diameter_mm', label: 'Diameter in MM' },
  { key: 'length_mtrs', label: 'Length Mtrs' },
  { key: 'width', label: 'Width' },
  { key: 'thickness', label: 'Thickness' },
  { key: 'part_serial_number', label: 'Part Serial Number' },
  { key: 'part_name', label: 'Part Name' },
  { key: 'part_drawing_reference_number', label: 'Part Drawing Number' },
  { key: 'opening_stock', label: 'Opening Stock', numeric: true },
  { key: 'receipts', label: 'Receipts', numeric: true },
  { key: 'issued', label: 'Issued', numeric: true },
  { key: 'closing_stock', label: 'Closing Stock', numeric: true },
  { key: 'cost_per_unit', label: 'Cost Per Unit', numeric: true },
  { key: 'consumption_per_unit', label: 'Standard consumption per Unit', numeric: true },
  { key: 'units_producible', label: 'No of units can be produced', numeric: true },
]

export default function RawMaterialStockMaster() {
  return (
    <ReadOnlyMasterView
      title="Stores Master – Raw Material"
      subtitle="Raw material stock, cost and units producible by part"
      loadRows={listRawMaterialStockMaster}
      columns={COLUMNS}
      rowKey="row_key"
    />
  )
}
