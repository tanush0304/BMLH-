import {
  LayoutDashboard,
  Database,
  Factory,
  ShieldCheck,
  ClipboardList,
  Truck,
  Wrench,
  Warehouse,
  LogOut,
} from 'lucide-react'
import { NAV_ITEMS } from '../utils/constants'

const ICONS = {
  dashboard: LayoutDashboard,
  masters: Database,
  production: Factory,
  quality: ShieldCheck,
  'customer-order': ClipboardList,
  'job-order': Truck,
  maintenance: Wrench,
  stores: Warehouse,
}

export default function Sidebar({ activeKey, onSelect, userEmail, onSignOut, role }) {
  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role))

  return (
    <aside className="w-52 shrink-0 bg-white text-bmlhnavy flex flex-col h-full overflow-y-auto border-r border-gray-200">
      <div className="px-4 py-3.5 border-b border-gray-200">
        <div className="text-base font-bold tracking-wide text-bmlhnavy">BMLH</div>
        <div className="text-[11px] text-gray-500 mt-0.5">Operations Console</div>
      </div>
      <nav className="flex-1 py-2">
        {items.map((item) => {
          const Icon = ICONS[item.key] ?? LayoutDashboard
          const active = item.key === activeKey
          return (
            <button
              key={item.key}
              onClick={() => onSelect(item.key)}
              className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs transition-colors border-l-4 ${
                active
                  ? 'bg-bmlhsky border-bmlhblue text-bmlhblue font-semibold'
                  : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-bmlhnavy'
              }`}
            >
              <Icon size={15} />
              {item.label}
            </button>
          )
        })}
      </nav>
      <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] text-gray-600 truncate" title={userEmail}>
            {userEmail}
          </div>
          <div className="text-[10px] text-gray-400 capitalize">{role}</div>
        </div>
        <button
          onClick={onSignOut}
          className="text-gray-400 hover:text-bmlhblue shrink-0"
          title="Sign out"
        >
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  )
}
