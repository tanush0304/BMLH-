import {
  Boxes,
  Clock,
  ContactRound,
  Cog,
  Layers,
  Package,
  Route,
  ShieldCheck,
  Truck,
  User,
  Wrench,
} from 'lucide-react'
import PageHeader, { PageHeaderBandProvider } from '../../components/PageHeader'
import { NAV_ITEMS } from '../../utils/constants'
import employeeTile from '../../assets/tiles/employees.webp'
import customerTile from '../../assets/tiles/customers.webp'
import productTile from '../../assets/tiles/products.webp'
import supplierTile from '../../assets/tiles/suppliers.webp'
import rawMaterialTile from '../../assets/tiles/raw_materials.webp'
import vendorTile from '../../assets/tiles/job_work_vendors.webp'
import qualityTile from '../../assets/tiles/quality_parameters.webp'
import machineTile from '../../assets/tiles/machines.webp'
import jobWorkTile from '../../assets/tiles/job_work_types.webp'
import cycleTimeTile from '../../assets/tiles/cycle_times.webp'
import shiftTile from '../../assets/tiles/shifts.webp'
import productionBatchTile from '../../assets/tiles/production_batch_sizes.webp'
import maintenanceTile from '../../assets/tiles/machine_maintenance_schedule.webp'
import finishedGoodsTile from '../../assets/tiles/stores_fg.webp'
import wipTile from '../../assets/tiles/stores_wip.webp'
import routeCardTile from '../../assets/tiles/product_routes.webp'
import CustomerMaster from './CustomerMaster'
import ProductMaster from './ProductMaster'
import MachineMaster from './MachineMaster'
import JobWorkMaster from './JobWorkMaster'
import CycleTimeMaster from './CycleTimeMaster'
import RawMaterialMaster from './RawMaterialMaster'
import SupplierMaster from './SupplierMaster'
import ShiftMaster from './ShiftMaster'
import EmployeeMaster from './EmployeeMaster'
import VendorMaster from './VendorMaster'
import QualityMaster from './QualityMaster'
import MaintenanceMaster from './MaintenanceMaster'
import ProductionBatchMaster from './ProductionBatchMaster'
import RouteCardScreen from '../customerOrder/RouteCardScreen'
import FinishedGoodsMaster from './FinishedGoodsMaster'
import WipMaster from './WipMaster'

const MASTER_COMPONENTS = {
  product: ProductMaster,
  machine: MachineMaster,
  'job-work': JobWorkMaster,
  'cycle-time': CycleTimeMaster,
  customer: CustomerMaster,
  'raw-material': RawMaterialMaster,
  supplier: SupplierMaster,
  shift: ShiftMaster,
  employee: EmployeeMaster,
  vendor: VendorMaster,
  quality: QualityMaster,
  maintenance: MaintenanceMaster,
  'production-batch': ProductionBatchMaster,
  'route-card': RouteCardScreen,
  'finished-goods': FinishedGoodsMaster,
  wip: WipMaster,
}

const MASTER_PRESENTATION = {
  product: { icon: Package, iconColor: 'text-blue-700', iconBg: 'bg-blue-50' },
  machine: { icon: Cog, iconColor: 'text-sky-700', iconBg: 'bg-sky-50' },
  'job-work': { icon: Truck, iconColor: 'text-orange-700', iconBg: 'bg-orange-50' },
  'cycle-time': { icon: Route, iconColor: 'text-violet-700', iconBg: 'bg-violet-50' },
  customer: { icon: User, iconColor: 'text-rose-700', iconBg: 'bg-rose-50' },
  'raw-material': { icon: Boxes, iconColor: 'text-emerald-700', iconBg: 'bg-emerald-50' },
  supplier: { icon: Truck, iconColor: 'text-amber-700', iconBg: 'bg-amber-50' },
  shift: { icon: Clock, iconColor: 'text-indigo-700', iconBg: 'bg-indigo-50' },
  employee: { icon: ContactRound, iconColor: 'text-cyan-700', iconBg: 'bg-cyan-50' },
  vendor: { icon: Truck, iconColor: 'text-fuchsia-700', iconBg: 'bg-fuchsia-50' },
  quality: { icon: ShieldCheck, iconColor: 'text-teal-700', iconBg: 'bg-teal-50' },
  maintenance: { icon: Wrench, iconColor: 'text-red-700', iconBg: 'bg-red-50' },
  'production-batch': { icon: Layers, iconColor: 'text-lime-700', iconBg: 'bg-lime-50' },
  'route-card': { icon: Route, iconColor: 'text-purple-700', iconBg: 'bg-purple-50' },
  'finished-goods': { icon: Package, iconColor: 'text-green-700', iconBg: 'bg-green-50' },
  wip: { icon: Boxes, iconColor: 'text-orange-700', iconBg: 'bg-orange-50' },
}

// Tile artwork from the client UI deck (each image carries its own title).
const MASTER_TILES = {
  employee: employeeTile,
  customer: customerTile,
  product: productTile,
  supplier: supplierTile,
  'raw-material': rawMaterialTile,
  vendor: vendorTile,
  quality: qualityTile,
  machine: machineTile,
  'job-work': jobWorkTile,
  'cycle-time': cycleTimeTile,
  shift: shiftTile,
  'production-batch': productionBatchTile,
  maintenance: maintenanceTile,
  'finished-goods': finishedGoodsTile,
  wip: wipTile,
  'route-card': routeCardTile,
}

// Each tile's pastel background (sampled from its artwork) fills the space
// left around the image when it is scaled down to fit the grid.
const MASTER_TILE_BG = {
  employee: '#E2F0FF',
  customer: '#FFE7EF',
  product: '#E9F9E6',
  supplier: '#F0EBFF',
  'raw-material': '#FDF4E0',
  vendor: '#DEF7F8',
  quality: '#FFE1E9',
  machine: '#E4F2FD',
  'job-work': '#FFEDDF',
  'cycle-time': '#EAF9E4',
  shift: '#EFEAFC',
  'production-batch': '#FDE7EF',
  maintenance: '#E0EFFF',
  'finished-goods': '#EAF9E6',
  wip: '#EFEAFE',
  'route-card': '#FEF6DD',
}

const MASTER_NAV = NAV_ITEMS.find((item) => item.key === 'masters')?.subItems ?? []

export const MASTER_ENTRIES = MASTER_NAV.map((item) => ({
  ...item,
  ...MASTER_PRESENTATION[item.key],
  tile: MASTER_TILES[item.key],
  tileBg: MASTER_TILE_BG[item.key],
  component: MASTER_COMPONENTS[item.key],
}))

// The tile artwork is cropped to its picture; the title is rendered from the
// same label the sidebar uses rather than the text baked into the deck images.
export function MasterCard({ item, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      aria-label={'Open ' + item.label}
      title={item.label}
      style={{ backgroundColor: item.tileBg }}
      className="group flex w-full min-h-0 flex-col items-stretch overflow-hidden rounded-2xl border border-[#DCE4ED] px-2 pb-2 pt-3 text-center shadow-sm transition duration-150 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#176FA8]/50 md:h-full md:pb-[1.2vh] md:pt-[1.6vh]"
    >
      <span className="flex h-24 min-h-0 items-center justify-center md:h-auto md:flex-1">
        <img src={item.tile} alt="" loading="lazy" className="block h-full max-h-full w-full object-contain" />
      </span>
      <span className="mt-1 shrink-0 text-balance break-words text-[15px] font-bold leading-tight text-[#0A2266] md:text-[clamp(13px,min(1.45vw,2.6vh),24px)]">
        {item.label}
      </span>
    </button>
  )
}

function MastersLanding({ onSelect }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        eyebrow="Master Data"
        title="Masters"
        subtitle="Select a master module to view or manage its records."
      />
      {/* md+: 4x4 grid sized to the visible content area (no scrolling down to
          ~700px viewport height, where the min-height lets it scroll). Narrow
          screens fall back to 2 columns of 16:9 tiles with normal scrolling. */}
      <main className="flex-1 overflow-y-auto bg-[#F5F7FA] px-4 py-4 sm:px-6">
        <div className="mx-auto h-full w-full max-w-[1480px]">
          <div className="grid grid-cols-2 gap-3 md:h-full md:min-h-[520px] md:grid-cols-4 md:grid-rows-4">
            {MASTER_ENTRIES.map((item) => (
              <MasterCard key={item.key} item={item} onSelect={onSelect} />
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

// With no selected submenu, show the selector. Sidebar submenu clicks open
// the same screen component as selecting its card.
export default function MasterList({ activeTab, onSelect }) {
  const entity = MASTER_ENTRIES.find((item) => item.key === activeTab)
  if (!entity) {
    return (
      <PageHeaderBandProvider breadcrumb={[{ label: 'Masters' }]}>
        <MastersLanding onSelect={onSelect} />
      </PageHeaderBandProvider>
    )
  }

  const Screen = entity.component
  return (
    <PageHeaderBandProvider breadcrumb={[{ label: 'Masters', onClick: () => onSelect(null) }, { label: entity.label }]}>
      <Screen />
    </PageHeaderBandProvider>
  )
}
