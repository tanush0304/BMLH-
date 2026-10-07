import { useState } from 'react'
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Database,
  Factory,
  LogOut,
  Menu,
  ShieldCheck,
  Truck,
  Warehouse,
  Wrench,
} from 'lucide-react'
import { NAV_ITEMS } from '../utils/constants'

function initialsFor(email) {
  const name = email?.split('@')[0] ?? ''
  const parts = name.split(/[._-]/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

const MODULE_PRESENTATION = {
  masters: { label: 'Masters', icon: Database, color: 'text-amber-500' },
  production: { label: 'Production', icon: Factory, color: 'text-sky-500' },
  quality: { label: 'Quality', icon: ShieldCheck, color: 'text-emerald-500' },
  'customer-order': { label: 'Customer Orders', icon: ClipboardList, color: 'text-violet-500' },
  'job-order': { label: 'Jobwork', icon: Truck, color: 'text-orange-500' },
  maintenance: { label: 'Maintenance', icon: Wrench, color: 'text-rose-500' },
  stores: { label: 'Stores', icon: Warehouse, color: 'text-teal-500' },
  dashboard: { label: 'Reports & Dashboard', icon: BarChart3, color: 'text-indigo-500' },
}

// Contextual accordion: a module's group auto-expands while one of its
// screens is open (current screen highlighted, siblings one click away) and
// stays collapsed on a module landing page (e.g. the Masters card selector),
// so the sidebar never duplicates the workspace. Other modules stay visible.
function contextualExpandedKey(activeKey, activeSubKey) {
  return activeSubKey ? activeKey : null
}

export default function Sidebar({ activeKey, activeSubKey, onSelect, onSelectSub, userEmail, onSignOut, role }) {
  const isRestricted = (module) => Boolean(module.roles && !module.roles.includes(role))
  const [collapsed, setCollapsed] = useState(false)
  const [expandedKey, setExpandedKey] = useState(() => contextualExpandedKey(activeKey, activeSubKey))
  const [lastContext, setLastContext] = useState(`${activeKey}/${activeSubKey}`)

  // Re-sync with navigation that happens outside the sidebar (Dashboard
  // shortcuts, the Masters card selector) -- adjusted during render rather
  // than in an effect so the first paint is already correct.
  const context = `${activeKey}/${activeSubKey}`
  if (context !== lastContext) {
    setLastContext(context)
    setExpandedKey(contextualExpandedKey(activeKey, activeSubKey))
  }

  function handleModuleClick(module) {
    // Clicking the module you're already in just opens/closes its list;
    // clicking any other module navigates there.
    if (module.subItems && module.key === activeKey) {
      setExpandedKey((k) => (k === module.key ? null : module.key))
    } else {
      onSelect(module.key)
    }
  }

  return (
    <aside
      className={`flex h-full ${collapsed ? 'w-[68px]' : 'w-[264px]'} shrink-0 flex-col overflow-hidden border-r border-[#0D2D4B] bg-[#173A63] text-white transition-[width]`}
    >
      <div className="flex min-h-[76px] shrink-0 items-center gap-3 border-b border-white/15 bg-[#102F50] px-4 py-3">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="shrink-0 rounded p-1 text-white/75 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Menu size={18} />
        </button>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-[13px] font-bold leading-tight text-white">Pragati &amp; Unnati</div>
            <div className="mt-1 text-[10px] font-medium leading-tight text-white/65">Data Management System</div>
          </div>
        )}
      </div>

      <nav className={`min-h-0 flex-1 overflow-y-auto py-4 ${collapsed ? 'px-2' : 'px-3'}`} aria-label="Application modules">
        <div className="space-y-1.5">
          {NAV_ITEMS.map((module) => {
            const presentation = MODULE_PRESENTATION[module.key] ?? { label: module.label, icon: Database }
            const Icon = presentation.icon
            const selected = activeKey === module.key
            const locked = isRestricted(module)
            const expanded = !collapsed && !locked && Boolean(module.subItems) && expandedKey === module.key
            const Chevron = expanded ? ChevronDown : ChevronRight
            return (
              <div key={module.key}>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => handleModuleClick(module)}
                  aria-current={selected ? 'page' : undefined}
                  aria-expanded={module.subItems && !locked ? expanded : undefined}
                  aria-label={locked ? `${presentation.label}. Supervisor or admin access required.` : `Open ${presentation.label}`}
                  title={locked ? 'Supervisor or admin access required' : collapsed ? presentation.label : undefined}
                  className={`group flex min-h-[48px] w-full items-center gap-3 rounded-md border py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-[#176FA8]/40 ${collapsed ? 'justify-center px-0' : 'px-3'} ` +
                    (selected
                      ? 'border-white bg-white text-[#173A63] shadow-[0_2px_8px_rgba(0,0,0,0.18)]'
                      : locked
                        ? 'cursor-not-allowed border-transparent bg-transparent text-white/35'
                        : 'border-transparent bg-transparent text-white/90 hover:border-white/20 hover:bg-white/10')}
                >
                  <span className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white shadow-[0_1px_3px_rgba(0,0,0,0.15)] ' + (locked ? 'opacity-40' : '')}>
                    <Icon className={presentation.color} size={19} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  {!collapsed && (
                    <>
                      <span className="min-w-0 flex-1 text-[13px] font-semibold leading-tight">{presentation.label}</span>
                      {module.subItems && !locked && <Chevron size={15} className="shrink-0 opacity-70" aria-hidden="true" />}
                    </>
                  )}
                </button>

                {expanded && (
                  <div className="ml-[30px] mt-1 space-y-0.5 border-l border-white/25 pl-2" role="group" aria-label={`${presentation.label} screens`}>
                    {module.subItems.map((screen) => {
                      const isActiveScreen = selected && activeSubKey === screen.key
                      return (
                        <button
                          key={screen.key}
                          type="button"
                          onClick={() => onSelectSub(module.key, screen.key)}
                          aria-current={isActiveScreen ? 'page' : undefined}
                          className={'flex min-h-[32px] w-full items-center gap-2 rounded-r px-2.5 text-left text-[12px] leading-tight transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#176FA8]/35 ' +
                            (isActiveScreen ? 'border-l-2 border-[#9BD86B] bg-white/15 font-semibold text-white' : 'border-l-2 border-transparent text-white/75 hover:bg-white/10 hover:text-white')}
                        >
                          <span
                            className={'h-1.5 w-1.5 shrink-0 rounded-full ' + (isActiveScreen ? 'bg-[#9BD86B]' : 'border border-white/50')}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1">{screen.label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </nav>

      <div className="shrink-0 border-t border-white/20 bg-[#102F50] px-3 py-3">
        <div className={`flex items-center gap-2.5 ${collapsed ? 'flex-col' : ''}`}>
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#76C043] text-[10px] font-bold text-[#173A63]"
            title={collapsed ? userEmail : undefined}
          >
            {initialsFor(userEmail)}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-medium text-white" title={userEmail}>{userEmail}</div>
              <div className="text-[10px] capitalize text-white/60">{role}</div>
            </div>
          )}
          <button
            type="button"
            onClick={onSignOut}
            className="shrink-0 rounded p-1.5 text-white/65 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
