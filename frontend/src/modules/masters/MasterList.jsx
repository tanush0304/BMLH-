import {
  Boxes,
  ChevronRight,
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
import PageHeader from '../../components/PageHeader'
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

const MASTER_NAV = NAV_ITEMS.find((item) => item.key === 'masters')?.subItems ?? []

export const MASTER_ENTRIES = MASTER_NAV.map((item) => ({
  ...item,
  ...MASTER_PRESENTATION[item.key],
  component: MASTER_COMPONENTS[item.key],
}))

export function MasterCard({ item, onSelect }) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      aria-label={'Open ' + item.label}
      className="group flex min-h-[104px] w-full items-center gap-4 rounded-xl border border-[#DCE4ED] bg-white px-4 py-4 text-left shadow-[0_2px_7px_rgba(18,49,78,0.045)] transition duration-150 hover:-translate-y-0.5 hover:border-[#8CB4D8] hover:shadow-[0_8px_18px_rgba(18,49,78,0.1)] focus:outline-none focus:ring-2 focus:ring-[#176FA8]/35"
    >
      <span className={'flex h-12 w-12 shrink-0 items-center justify-center rounded-full ' + item.iconBg}>
        <Icon size={23} strokeWidth={1.9} className={item.iconColor} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug text-[#183B60]">
        {item.label}
      </span>
      <ChevronRight
        size={18}
        className="shrink-0 text-[#8A9BAD] transition-transform group-hover:translate-x-0.5 group-hover:text-[#176FA8]"
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
      <main className="flex-1 overflow-y-auto bg-[#F5F7FA] px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto w-full max-w-[1480px]">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-4">
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
  if (!entity) return <MastersLanding onSelect={onSelect} />

  const Screen = entity.component
  return <Screen />
}