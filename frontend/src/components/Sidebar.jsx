import { useEffect, useState } from 'react'
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
  ChevronDown,
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

// One accordion column instead of a top-level nav + a second per-module tab
// column: a top-level item with subItems is a pure toggle (expand/collapse
// its own list inline, pushing items below it down) -- it has no screen of
// its own, so clicking it never navigates. Only a leaf (no subItems) or a
// sub-item actually changes what's showing.
export default function Sidebar({ activeKey, activeSubKey, onSelect, onSelectSub, userEmail, onSignOut, role }) {
  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role))
  const [expandedKey, setExpandedKey] = useState(activeKey)

  // If the active module changes from outside (e.g. a Dashboard shortcut),
  // keep that module's group expanded so the user doesn't lose their place.
  useEffect(() => {
    setExpandedKey(activeKey)
  }, [activeKey])

  function handleTopClick(item) {
    if (item.subItems) {
      setExpandedKey((k) => (k === item.key ? null : item.key))
    } else {
      setExpandedKey(null)
      onSelect(item.key)
    }
  }

  return (
    <aside className="w-52 shrink-0 bg-white text-bmlhnavy flex flex-col h-full overflow-y-auto border-r border-gray-200">
      <div className="px-4 py-3.5 border-b border-gray-200">
        <div className="text-base font-bold tracking-wide text-bmlhnavy">BMLH</div>
        <div className="text-[11px] text-gray-500 mt-0.5">Operations Console</div>
      </div>
      <nav className="flex-1 py-2">
        {items.map((item) => {
          const Icon = ICONS[item.key] ?? LayoutDashboard
          const isExpanded = expandedKey === item.key
          const isActiveLeaf = !item.subItems && item.key === activeKey
          return (
            <div key={item.key}>
              <button
                onClick={() => handleTopClick(item)}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs transition-colors border-l-4 ${
                  isActiveLeaf || (item.subItems && item.key === activeKey)
                    ? 'bg-bmlhsky border-bmlhblue text-bmlhblue font-semibold'
                    : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-bmlhnavy'
                }`}
              >
                <Icon size={15} className="shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.subItems && (
                  <ChevronDown
                    size={13}
                    className={`shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                )}
              </button>
              {item.subItems && isExpanded && (
                <div className="bg-gray-50/60">
                  {item.subItems.map((sub) => (
                    <button
                      key={sub.key}
                      onClick={() => onSelectSub(item.key, sub.key)}
                      className={`w-full text-left pl-11 pr-4 py-1.5 text-xs border-l-4 ${
                        item.key === activeKey && sub.key === activeSubKey
                          ? 'border-bmlhblue bg-bmlhsky text-bmlhblue font-medium'
                          : 'border-transparent text-gray-500 hover:bg-gray-100 hover:text-bmlhnavy'
                      }`}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
