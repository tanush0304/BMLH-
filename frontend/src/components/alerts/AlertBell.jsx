import { Bell } from 'lucide-react'
import { useAlerts } from './AlertsContext'

// Header bell with a count badge; supervisor/admin only (renders nothing
// otherwise, or outside an AlertsProvider).
export default function AlertBell({ className = '' }) {
  const alerts = useAlerts()
  if (!alerts?.allowed) return null
  const { count, openList } = alerts
  const label = count === 1 ? '1 item needs attention' : `${count} items need attention`
  return (
    <button
      type="button"
      onClick={openList}
      aria-label={`Notifications: ${label}`}
      title={label}
      className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#CBD5E1] bg-white text-[#344F69] transition hover:border-[#176FA8] hover:text-[#176FA8] focus:outline-none focus:ring-2 focus:ring-[#176FA8]/25 ${className}`}
    >
      <Bell size={18} aria-hidden="true" />
      <span
        data-testid="alert-count"
        className={`absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full px-1 text-center text-[11px] font-bold leading-[18px] text-white ${count > 0 ? 'bg-red-600' : 'bg-slate-400'}`}
      >
        {count > 99 ? '99+' : count}
      </span>
    </button>
  )
}
