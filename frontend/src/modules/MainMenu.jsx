import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  Database,
  Factory,
  House,
  ShieldCheck,
  Truck,
  Warehouse,
  Wrench,
} from 'lucide-react'
import bmlhLogo from '../assets/bmlh-logo.png'
import pragatiUnnatiLogo from '../assets/pragati-unnati-logo.png'
import mainMenuHero from '../assets/main-menu-hero.jpg'

const MODULES = [
  {
    key: 'masters',
    title: 'Masters',
    description: 'Manage master data for customers, suppliers, materials, products, machines and other key information.',
    icon: Database,
    color: 'blue',
  },
  {
    key: 'customer-order',
    title: 'Customer Orders',
    description: 'Manage customer enquiries, quotations, sales orders and dispatch.',
    icon: ClipboardList,
    color: 'purple',
  },
  {
    key: 'production',
    title: 'Production',
    description: 'Manage production orders, job route cards, operation entry and production monitoring.',
    icon: Factory,
    color: 'red',
  },
  {
    key: 'job-order',
    title: 'Jobwork',
    description: 'Manage jobwork orders, materials sent to job workers, receipts and completion status.',
    icon: Truck,
    color: 'orange',
  },
  {
    key: 'quality',
    title: 'Quality',
    description: 'Handle in-process and final inspection, quality records and customer complaints.',
    icon: ShieldCheck,
    color: 'green',
  },
  {
    key: 'maintenance',
    title: 'Maintenance',
    description: 'Plan and track preventive maintenance, breakdown maintenance and service records.',
    icon: Wrench,
    color: 'pink',
  },
  {
    key: 'stores',
    title: 'Stores',
    description: 'Manage raw materials, work in progress, finished goods, receipts, issues and stock.',
    icon: Warehouse,
    color: 'cyan',
  },
  {
    key: 'dashboard',
    title: 'Reports and Dashboard',
    description: 'View open orders, pending production stages and overdue jobwork at a glance.',
    icon: BarChart3,
    color: 'lime',
  },
]

const CARD_COLORS = {
  blue: { surface: 'bg-[#EAF4FD]', icon: 'bg-[#1260AA]', text: 'text-[#07519C]' },
  red: { surface: 'bg-[#FFF0F0]', icon: 'bg-[#D91414]', text: 'text-[#B91515]' },
  green: { surface: 'bg-[#EAF7EE]', icon: 'bg-[#087C2C]', text: 'text-[#086326]' },
  purple: { surface: 'bg-[#F3EDFC]', icon: 'bg-[#590DB2]', text: 'text-[#51109C]' },
  orange: { surface: 'bg-[#FFF5E5]', icon: 'bg-[#F47A00]', text: 'text-[#D96300]' },
  pink: { surface: 'bg-[#FCECF3]', icon: 'bg-[#C20A4D]', text: 'text-[#B90948]' },
  cyan: { surface: 'bg-[#E9F7FB]', icon: 'bg-[#0085A8]', text: 'text-[#007497]' },
  lime: { surface: 'bg-[#F1F9E5]', icon: 'bg-[#367F16]', text: 'text-[#2F7012]' },
}

export default function MainMenu({ role, onNavigate, onSignOut }) {
  const canSeeMasters = role === 'supervisor' || role === 'admin'

  return (
    <main className="flex min-h-screen flex-col bg-[#F5F7FA] text-[#1D2B3B]">
      <header className="grid min-h-[76px] grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-[#D9E1E8] bg-white px-4 py-2.5 shadow-sm sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center">
          <img src={pragatiUnnatiLogo} alt="Pragati & Unnati — Together Towards a Better Tomorrow" className="w-[145px] shrink-0 object-contain sm:w-[180px]" />
        </div>
        <h1 className="text-center text-lg font-bold leading-tight text-[#173A63] sm:text-2xl lg:text-[30px]">Data Management System</h1>
        <div className="flex items-center justify-end gap-3 sm:gap-5">
          <nav aria-label="Main navigation" className="hidden sm:block">
            <button type="button" aria-current="page" className="inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-[#344F69]">
              <House size={17} aria-hidden="true" /> Home
            </button>
          </nav>
          <button onClick={onSignOut} className="rounded-md border border-[#CBD5E1] px-3 py-2 text-xs font-medium text-[#465D73] transition hover:border-[#176FA8] hover:text-[#176FA8] focus:outline-none focus:ring-2 focus:ring-[#176FA8]/25 sm:text-sm">
            Sign out
          </button>
          <img src={bmlhLogo} alt="BMLH Engineering" className="hidden h-10 w-auto max-w-[132px] object-contain sm:block" />
        </div>
      </header>

      <section
        className="relative flex min-h-[132px] items-center justify-center overflow-hidden bg-[#0F3767] bg-cover bg-center px-5 py-5 text-white sm:min-h-[145px] sm:px-8 lg:px-12"
        style={{ backgroundImage: `linear-gradient(90deg, rgba(9,43,84,.76), rgba(9,43,84,.24)), url(${mainMenuHero})` }}
        aria-labelledby="main-menu-title"
      >
        <div className="text-center">
          <h2 id="main-menu-title" className="text-3xl font-bold tracking-tight drop-shadow sm:text-[38px]">Main Menu</h2>
          <p className="mt-1 text-sm text-white/95 sm:text-lg">Select a module to access the system</p>
        </div>
      </section>

      <section aria-label="System modules" className="mx-auto grid w-full max-w-[1680px] flex-1 grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 sm:gap-4 sm:px-5 lg:grid-cols-4 lg:grid-rows-2 lg:gap-4 lg:px-5 lg:py-4">
        {MODULES.map((module) => {
          const Icon = module.icon
          const colors = CARD_COLORS[module.color]
          const locked = module.key === 'masters' && !canSeeMasters
          return (
            <button
              key={module.key}
              type="button"
              disabled={locked}
              onClick={() => onNavigate(module.key)}
              aria-label={locked ? `${module.title}. Supervisor or admin access required.` : `Open ${module.title}`}
              className={`group relative flex min-h-[184px] items-start gap-4 rounded-xl border border-white/80 p-4 text-left shadow-[0_3px_12px_rgba(18,49,78,0.06)] transition duration-150 sm:min-h-[205px] sm:gap-5 sm:p-5 lg:min-h-0 lg:items-center lg:px-5 xl:px-6 ${colors.surface} ${locked ? 'cursor-not-allowed opacity-70' : 'hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(18,49,78,0.12)] focus:outline-none focus:ring-4 focus:ring-[#176FA8]/25'}`}
            >
              <span className={`flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full text-white shadow-sm sm:h-[86px] sm:w-[86px] ${colors.icon}`}>
                <Icon size={43} strokeWidth={2.4} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 pb-5 lg:pb-0">
                <span className={`block text-lg font-bold leading-tight sm:text-xl xl:text-[22px] ${colors.text}`}>{module.title}</span>
                <span className="mt-2 block text-sm leading-[1.45] text-[#3F4F60] sm:text-[15px]">{locked ? 'Supervisor or admin access is required to manage master data.' : module.description}</span>
              </span>
              <ArrowRight size={24} strokeWidth={2.8} className={`absolute bottom-4 right-4 transition-transform group-hover:translate-x-1 ${colors.text}`} aria-hidden="true" />
            </button>
          )
        })}
      </section>
    </main>
  )
}
