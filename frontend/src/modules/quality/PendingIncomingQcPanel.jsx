import { useEffect, useState } from 'react'
import { PackageCheck } from 'lucide-react'
import { jobworkQcGateSupported, loadQcGateData } from '../../data/queries/jobworkQc'
import { pendingIncomingQc } from '../../utils/jobworkQc'
import { ddmmyyyy } from '../../utils/alerts'
import StatusPill from '../../components/StatusPill'

// "Pending incoming QC" (055): every jobwork receipt waiting for its incoming
// inspection (none yet, or the latest one Rejected) -- what blocks the next
// stage. All roles. Hidden before 055 and while the gate is off.
// Inspect -> onInspect(item) pre-fills Quality Inspection with that receipt.
export default function PendingIncomingQcPanel({ onInspect, refreshKey = 0 }) {
  const [state, setState] = useState({ shown: false, items: [], error: null })

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        if (!(await jobworkQcGateSupported())) return
        const data = await loadQcGateData()
        if (!live) return
        setState({ shown: data.settings.on, items: pendingIncomingQc(data), error: null })
      } catch (e) {
        if (live) setState({ shown: true, items: [], error: e.message })
      }
    })()
    return () => {
      live = false
    }
  }, [refreshKey])

  if (!state.shown) return null
  return (
    <section className="bg-white border border-amber-300 rounded-md overflow-hidden" aria-label="Pending incoming QC">
      <div className="flex items-center gap-2 bg-amber-50 border-b border-amber-200 px-3.5 py-1.5">
        <PackageCheck size={14} className="text-amber-700" aria-hidden="true" />
        <h2 className="text-xs font-semibold text-amber-900">Pending incoming QC ({state.items.length})</h2>
        <span className="text-[11px] text-amber-800">Material back from jobwork -- the next stage can't start until it passes.</span>
      </div>
      {state.error ? (
        <p className="px-3.5 py-2 text-xs text-red-700">Could not load pending receipts: {state.error}</p>
      ) : state.items.length === 0 ? (
        <p className="px-3.5 py-2 text-xs text-gray-500">No jobwork receipts are waiting for inspection.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-left text-bmlhnavy">
                <th className="px-3 py-1.5 font-semibold">PRD</th>
                <th className="px-3 py-1.5 font-semibold">Stage</th>
                <th className="px-3 py-1.5 font-semibold">DC</th>
                <th className="px-3 py-1.5 font-semibold">Receipt</th>
                <th className="px-3 py-1.5 font-semibold">Received</th>
                <th className="px-3 py-1.5 font-semibold">Qty</th>
                <th className="px-3 py-1.5 font-semibold">Status</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {state.items.map((item) => (
                <tr key={item.receipt_id} className="border-t border-gray-100">
                  <td className="px-3 py-1">{item.prd_no}</td>
                  <td className="px-3 py-1">{item.operation}</td>
                  <td className="px-3 py-1">{item.dc_no}</td>
                  <td className="px-3 py-1">{item.receipt_no}</td>
                  <td className="px-3 py-1">{ddmmyyyy(item.receipt_date)}</td>
                  <td className="px-3 py-1">{item.qty_received}</td>
                  <td className="px-3 py-1">
                    {item.state === 'rejected'
                      ? <StatusPill status="Rejected" />
                      : <span className="text-amber-800">Not inspected</span>}
                  </td>
                  <td className="px-3 py-1 text-right">
                    <button type="button" onClick={() => onInspect?.(item)} className="rounded bg-bmlhblue px-2.5 py-1 text-[11px] font-medium text-white">
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
