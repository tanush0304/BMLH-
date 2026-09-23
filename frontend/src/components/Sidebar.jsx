import {
  LayoutDashboard,
  Database,
  PencilRuler,
  Factory,
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
  drawing: PencilRuler,
  production: Factory,
  'customer-order': ClipboardList,
  'job-order': Truck,
  maintenance: Wrench,
  stores: Warehouse,
}

export default function Sidebar({ activeKey, onSelect, userEmail, onSignOut, role }) {
  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role))

  return (
    <aside className="w-60 shrink-0 bg-ink text-white flex flex-col min-h-screen">
      <div className="px-5 py-6 border-b border-white/10">
        <div className="text-lg font-bold tracking-wide">BMLH</div>
        <div className="text-xs text-white/50 mt-0.5">Operations Console</div>
      </div>
      <nav className="flex-1 py-3">
        {items.map((item) => {
          const Icon = ICONS[item.key] ?? LayoutDashboard
          const active = item.key === activeKey
          return (
            <button
              key={item.key}
              onClick={() => onSelect(item.key)}
              className={`w-full flex items-center gap-3 px-5 py-3 text-sm transition-colors border-l-4 ${
                active
                  ? 'bg-white/5 border-amber text-amber font-medium'
                  : 'border-transparent text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon size={18} />
              {item.label}
            </button>
          )
        })}
      </nav>
      <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-white/40 truncate" title={userEmail}>
            {userEmail}
          </div>
          <div className="text-[10px] text-white/30 capitalize">{role}</div>
        </div>
        <button
          onClick={onSignOut}
          className="text-white/50 hover:text-white shrink-0"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  )
}
