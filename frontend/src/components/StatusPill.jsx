import { STATUS_COLORS } from '../utils/constants'

export default function StatusPill({ status }) {
  if (!status) return <span className="text-gray-400 text-xs">—</span>
  const cls = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
      {status}
    </span>
  )
}
