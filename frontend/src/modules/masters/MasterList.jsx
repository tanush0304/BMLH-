import CustomerMaster from './CustomerMaster'
import ProductMaster from './ProductMaster'
import MachineMaster from './MachineMaster'
import JobWorkMaster from './JobWorkMaster'
import CycleTimeMaster from './CycleTimeMaster'
import RawMaterialMaster from './RawMaterialMaster'
import SupplierMaster from './SupplierMaster'
import ShiftMaster from './ShiftMaster'
import UserMaster from './UserMaster'
import VendorMaster from './VendorMaster'
import QualityMaster from './QualityMaster'
import MaintenanceMaster from './MaintenanceMaster'
import ProductionBatchMaster from './ProductionBatchMaster'

const ENTITIES = [
  { key: 'product', component: ProductMaster },
  { key: 'machine', component: MachineMaster },
  { key: 'job-work', component: JobWorkMaster },
  { key: 'cycle-time', component: CycleTimeMaster },
  { key: 'customer', component: CustomerMaster },
  { key: 'raw-material', component: RawMaterialMaster },
  { key: 'supplier', component: SupplierMaster },
  { key: 'shift', component: ShiftMaster },
  { key: 'user', component: UserMaster },
  { key: 'vendor', component: VendorMaster },
  { key: 'quality', component: QualityMaster },
  { key: 'maintenance', component: MaintenanceMaster },
  { key: 'production-batch', component: ProductionBatchMaster },
]

// Sub-tab selection now lives in the Sidebar's accordion (see NAV_ITEMS'
// 'masters' subItems) -- this just maps the active key to a screen.
export default function MasterList({ activeTab }) {
  const entity = ENTITIES.find((e) => e.key === activeTab) ?? ENTITIES[0]
  const Screen = entity.component
  return <Screen />
}
