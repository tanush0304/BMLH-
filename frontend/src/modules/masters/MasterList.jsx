import {
  Award,
  Barcode,
  Box,
  Boxes,
  ChevronRight,
  Clock,
  Cog,
  Factory,
  Hammer,
  Handshake,
  Route,
  Timer,
  Truck,
  Users,
  UsersRound,
  Warehouse,
  Wrench,
} from 'lucide-react'
import PageHeader, { PageHeaderBandProvider } from '../../components/PageHeader'
import { NAV_ITEMS } from '../../utils/constants'
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
import RawMaterialStockMaster from './RawMaterialStockMaster'

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
  'rm-stock': RawMaterialStockMaster,
}

// PPT card style: pastel circle + coloured icon, title, two-line description.
// `badge` overlays a small second icon where lucide has no combined glyph
// (Shift = users + clock, Maintenance = wrench + hammer).
const MASTER_PRESENTATION = {
  employee: { icon: Users, color: '#2563EB', bg: '#DBEAFE', description: 'Manage employee details, roles and skills' },
  customer: { icon: UsersRound, color: '#E11D48', bg: '#FFE4E6', description: 'Manage customer details and contact information' },
  product: { icon: Box, color: '#16A34A', bg: '#DCFCE7', description: 'Manage product details and specifications' },
  supplier: { icon: Truck, color: '#7C3AED', bg: '#EDE9FE', description: 'Manage supplier details and contact information' },
  'raw-material': { icon: Boxes, color: '#EA580C', bg: '#FFEDD5', description: 'Manage raw material details and specifications' },
  vendor: { icon: Handshake, color: '#0D9488', bg: '#CCFBF1', description: 'Manage vendor details and contact information' },
  quality: { icon: Award, color: '#DC2626', bg: '#FEE2E2', description: 'Manage quality parameters and inspection standards' },
  machine: { icon: Factory, color: '#1D4ED8', bg: '#DBEAFE', description: 'Manage machine details and specifications' },
  'job-work': { icon: Cog, color: '#D97706', bg: '#FEF3C7', description: 'Manage jobwork vendor details and operations' },
  'cycle-time': { icon: Timer, color: '#0F766E', bg: '#CCFBF1', description: 'Manage standard cycle times for operations' },
  shift: { icon: Users, badge: Clock, color: '#7C3AED', bg: '#EDE9FE', description: 'Manage shift details and timings' },
  'production-batch': { icon: Barcode, color: '#DC2626', bg: '#FEE2E2', description: 'Manage production batch details and parameters' },
  maintenance: { icon: Wrench, badge: Hammer, color: '#2563EB', bg: '#DBEAFE', description: 'Manage maintenance details and schedules' },
  'finished-goods': { icon: Warehouse, color: '#16A34A', bg: '#DCFCE7', description: 'Manage finished goods store details and parameters' },
  wip: { icon: Warehouse, color: '#7C3AED', bg: '#EDE9FE', description: 'Manage work in progress store details and parameters' },
  'rm-stock': { icon: Warehouse, color: '#EA580C', bg: '#FFEDD5', description: 'Manage raw material stock, cost and units producible' },
  'route-card': { icon: Route, color: '#D97706', bg: '#FEF3C7', description: 'Manage operation sequences and routing details' },
}

const MASTER_NAV = NAV_ITEMS.find((item) => item.key === 'masters')?.subItems ?? []

export const MASTER_ENTRIES = MASTER_NAV.map((item) => ({
  ...item,
  ...MASTER_PRESENTATION[item.key],
  component: MASTER_COMPONENTS[item.key],
}))

// PPT card: white card, pastel icon circle left, navy title + grey
// two-line description middle, chevron right. Title is the same label the
// sidebar uses (constants.js).
export function MasterCard({ item, onSelect }) {
  const Icon = item.icon
  const Badge = item.badge
  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      aria-label={'Open ' + item.label}
      title={item.label}
      className="group flex w-full min-h-[96px] items-center gap-3 overflow-hidden rounded-2xl border border-[#DCE4ED] bg-white px-3 py-3 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-[#93B4E3] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#176FA8]/50 md:h-full md:min-h-0 md:gap-[clamp(8px,1vw,16px)] md:px-[clamp(10px,1.2vw,20px)]"
    >
      <span
        className="relative flex aspect-square w-12 shrink-0 items-center justify-center rounded-full md:w-[clamp(40px,min(4.2vw,7vh),72px)]"
        style={{ backgroundColor: item.bg }}
        aria-hidden="true"
      >
        <Icon className="h-1/2 w-1/2" style={{ color: item.color }} strokeWidth={1.9} />
        {Badge && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-[42%] w-[42%] items-center justify-center rounded-full bg-white shadow-sm">
            <Badge className="h-[72%] w-[72%]" style={{ color: item.color }} strokeWidth={2.2} />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[14px] font-bold leading-tight text-[#0A2266] md:text-[clamp(13px,min(1.2vw,2.3vh),20px)]">
          {item.label}
        </span>
        <span className="line-clamp-2 text-[12px] leading-snug text-slate-500 md:text-[clamp(11px,min(0.85vw,1.7vh),14px)]">
          {item.description}
        </span>
      </span>
      <ChevronRight
        className="h-5 w-5 shrink-0 text-slate-400 transition-colors group-hover:text-[#1669E0]"
        aria-hidden="true"
      />
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
      {/* md+: 4-column grid (17 cards -> 5 rows) sized to the visible content area (no scrolling down to
          ~700px viewport height, where the min-height lets it scroll). Narrow
          screens fall back to 2 columns of cards with normal scrolling. */}
      <main className="flex-1 overflow-y-auto bg-[#F5F7FA] px-4 py-4 sm:px-6">
        <div className="mx-auto h-full w-full max-w-[1480px]">
          <div className="grid grid-cols-2 gap-3 md:h-full md:min-h-[600px] md:grid-cols-4 md:grid-rows-5">
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
