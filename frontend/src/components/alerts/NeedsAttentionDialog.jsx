import { useEffect, useRef } from 'react'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { useAlerts } from './AlertsContext'

// "Needs attention" modal (ConfirmDialog look). Opened on the Main Menu
// (unless "Got it" this session) or from the bell. Esc / backdrop = Remind
// me later.
export default function NeedsAttentionDialog({ onOpenItem }) {
  const alerts = useAlerts()
  const gotItRef = useRef(null)
  const show = Boolean(alerts?.allowed && alerts.open)
  const later = alerts?.later

  useEffect(() => {
    if (!show) return undefined
    gotItRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && later()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show, later])

  if (!show) return null
  const { groups, count, gotIt } = alerts

  return (
    <div
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && later()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
    >
      <div role="dialog" aria-modal="true" aria-labelledby="needs-attention-title" className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center gap-2 text-amber-700">
          <AlertTriangle size={18} aria-hidden="true" />
          <h2 id="needs-attention-title" className="text-base font-semibold text-[#12305F]">Needs attention</h2>
          <span className="ml-auto rounded-full bg-red-600 px-2 text-xs font-bold leading-5 text-white">{count}</span>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {count === 0 && (
            <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">Nothing needs attention right now.</p>
          )}
          {groups.map((g) => (
            <section key={g.key}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.title}</h3>
              <ul className="divide-y divide-amber-100 rounded border border-amber-200 bg-amber-50">
                {g.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-3 py-2 text-sm text-slate-800">
                    <span className="min-w-0 flex-1">{item.text}</span>
                    <button
                      type="button"
                      onClick={() => {
                        later()
                        onOpenItem?.(item.open)
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded bg-[#176FA8] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#12305F]"
                    >
                      Open <ExternalLink size={12} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={later} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700">
            Remind me later
          </button>
          <button ref={gotItRef} type="button" onClick={gotIt} className="rounded bg-[#12305F] px-3 py-1.5 text-xs font-medium text-white">
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
