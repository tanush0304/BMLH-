import { STATUS_COLORS } from '../utils/constants'
import { displayStatus } from '../utils/statusLabels'

// Colour by the stored value; text = its display label ('Closed Short' ->
// "Partially Received (Closed)", see utils/statusLabels.js).
export default function StatusPill({ status }) {
  if (!status) return <span className="text-[13px] text-gray-400">—</span>
  const cls = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-block min-w-[74px] rounded-full px-3 py-0.5 text-center text-[12.5px] font-semibold ${cls}`}>
      {displayStatus(status)}
    </span>
  )
}
