import { STATUS_COLORS } from '../utils/constants'

export default function StatusPill({ status }) {
  if (!status) return <span className="text-[13px] text-gray-400">—</span>
  const cls = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-block min-w-[74px] rounded-full px-3 py-0.5 text-center text-[12.5px] font-semibold ${cls}`}>
      {status}
    </span>
  )
}
