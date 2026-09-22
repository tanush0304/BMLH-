import { STATUS_COLORS } from '../utils/constants'

export default function StatusPill({ status }) {
  if (!status) return <span className="text-gray-400 text-sm">—</span>
  const cls = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {status}
    </span>
  )
}
