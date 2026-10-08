import { useEffect, useState } from 'react'
import { Printer, X } from 'lucide-react'
import StatusPill from './StatusPill'
import { getRouteCard, getStagesForPrd } from '../data/queries/routeCards'
import { listCustomerOrders } from '../data/queries/customerOrders'
import { listProducts } from '../data/queries/products'
import { listJobWorkTypes } from '../data/queries/jobWorkTypes'
import { listDispatches } from '../data/queries/jobOrders'
import { listMachines } from '../data/queries/machines'
import {
  JOB_ROUTE_CARD_COLUMNS,
  TEMPLATE_COLUMNS,
  buildJobRouteCardRows,
  printJobRouteCard,
} from '../utils/jobRouteCard'

const TEMPLATE_KEYS = new Set(TEMPLATE_COLUMNS.map((c) => c.key))

function InfoCell({ label, value }) {
  return (
    <>
      <div className="border-b border-r border-slate-400 bg-slate-100 px-2.5 py-1.5 text-[12px] font-semibold text-slate-700">
        {label}
      </div>
      <div className="border-b border-r border-slate-400 px-2.5 py-1.5 text-[12.5px] text-slate-900">{value ?? ''}</div>
    </>
  )
}

/** Read-only Job Route Card for one PRD, laid out like BMLH's paper sheet.
 * The five template columns (from the PRD's frozen route card stages) are
 * pale yellow as on the sheet; Print opens a print-ready copy (Save as PDF). */
export default function JobRouteCardSheet({ prdNo, onClose }) {
  const [header, setHeader] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [card, stages, orders, products, jobWorkTypes, dispatches, machines] = await Promise.all([
          getRouteCard(prdNo),
          getStagesForPrd(prdNo),
          listCustomerOrders(),
          listProducts(),
          listJobWorkTypes(),
          listDispatches(),
          listMachines(),
        ])
        if (cancelled) return
        const order = orders.find((o) => o.prd_no === prdNo)
        const product = products.find((p) => p.part_serial_number === order?.part_serial_number)
        setHeader({
          jc_no: card.jc_no ?? '',
          prd_no: prdNo,
          batch_qty: card.batch_qty ?? '',
          shift_hours: card.shift_hours ?? '',
          part_serial_number: order?.part_serial_number ?? '',
          part_name: product?.part_name ?? '',
          part_drawing_reference_number: product?.part_drawing_reference_number ?? '',
        })
        setRows(buildJobRouteCardRows({ card, stages, jobWorkTypes, dispatches, machines }))
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [prdNo])

  return (
    <section className="rounded-xl border border-[#D5E3F4] bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-[#D5E3F4] px-4 py-2">
        <span className="text-[13px] font-semibold text-[#0B2A5B]">Job Route Card · {prdNo}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#A9C6EE] bg-[#E6F0FD] px-3 text-[13px] font-medium text-[#0B2A5B] hover:bg-[#D6E6FB] disabled:opacity-60"
            disabled={!header}
            onClick={() => printJobRouteCard({ header, rows })}
          >
            <Printer size={15} /> Print / PDF
          </button>
          {onClose && (
            <button
              type="button"
              aria-label="Close route card"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {error && <div className="m-3 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="px-4 py-3 text-sm text-slate-500">Loading route card...</div>}

      {!loading && header && (
        <div className="p-3">
          <div className="flex items-center justify-between border border-b-0 border-slate-500 px-3 py-2">
            <h2 className="text-[16px] font-bold tracking-wide text-slate-900">JOB ROUTE CARD</h2>
            <span className="text-[13px] font-semibold text-slate-900">JC No: {header.jc_no || '—'}</span>
          </div>
          <div className="grid grid-cols-2 border-l border-t border-slate-400 md:grid-cols-6">
            <InfoCell label="PRD Number" value={header.prd_no} />
            <InfoCell label="Batch Qty" value={header.batch_qty} />
            <InfoCell label="Shift Hours" value={header.shift_hours} />
            <InfoCell label="Part Serial Number" value={header.part_serial_number} />
            <InfoCell label="Part Name" value={header.part_name} />
            <InfoCell label="Drawing Reference Number" value={header.part_drawing_reference_number} />
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  {JOB_ROUTE_CARD_COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      className={`border border-slate-400 px-2 py-1.5 text-left font-semibold text-slate-800 ${
                        TEMPLATE_KEYS.has(c.key) ? 'bg-[#FFF2B3]' : 'bg-slate-100'
                      }`}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={JOB_ROUTE_CARD_COLUMNS.length} className="border border-slate-400 px-2 py-3 text-center text-slate-500">
                      No stages on this route card.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id}>
                    {JOB_ROUTE_CARD_COLUMNS.map((c) => (
                      <td
                        key={c.key}
                        className={`border border-slate-400 px-2 py-1.5 text-slate-900 ${TEMPLATE_KEYS.has(c.key) ? 'bg-[#FFF8D6]' : ''}`}
                      >
                        {c.key === 'status' ? <StatusPill status={r.status} /> : r[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
