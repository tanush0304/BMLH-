import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, Search } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import { listMachines } from '../../data/queries/machines'
import {
  listMaintenancePlanStatus,
  scheduleMaintenanceWeek,
  unscheduleMaintenanceWeek,
} from '../../data/queries/maintenancePlan'
import { formatLocalISODate, mondayOf } from '../../utils/dates'

const WEEK_COUNT = 12

// Every week-start date this grid computes/displays/saves is a MONDAY --
// the "maintenance plan status" view spans planned_week_start_date through
// planned_week_start_date + 6 days (Monday through Sunday) when deciding
// whether a logged visit satisfies that week's plan.
//
// formatLocalISODate, not toISOString(): mondayOf() pins its result to
// LOCAL midnight, and local midnight in IST (UTC+5:30) is always 18:30 UTC
// the PREVIOUS day -- toISOString().slice(0, 10) would report Sunday's
// date for every single Monday, not a rare near-midnight edge case.
function toISODate(d) {
  return formatLocalISODate(d)
}

export default function WeeklyPlanGridScreen() {
  const [machines, setMachines] = useState([])
  const [planStatus, setPlanStatus] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyCell, setBusyCell] = useState(null)
  const [search, setSearch] = useState('')

  const weeks = useMemo(() => {
    const start = mondayOf(new Date())
    return Array.from({ length: WEEK_COUNT }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i * 7)
      return toISODate(d)
    })
  }, [])

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [machs, status] = await Promise.all([listMachines(), listMaintenancePlanStatus()])
      setMachines(machs)
      setPlanStatus(status)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  function findCell(machineId, week) {
    return planStatus.find((p) => p.machine_id === machineId && p.planned_week_start_date === week)
  }

  async function handleCellClick(machineId, week) {
    const cell = findCell(machineId, week)
    setBusyCell(`${machineId}-${week}`)
    setError(null)
    try {
      if (!cell) {
        await scheduleMaintenanceWeek(machineId, week)
      } else if (cell.status === 'Planned') {
        if (!confirm('Remove this scheduled maintenance week?')) {
          setBusyCell(null)
          return
        }
        await unscheduleMaintenanceWeek(cell.plan_id)
      }
      // Completed cells are derived from real logs -- not editable here.
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyCell(null)
    }
  }

  function cellClasses(cell) {
    if (cell?.status === 'Completed') return 'bg-green-500'
    if (cell?.status === 'Planned') return 'bg-amber-300 hover:bg-amber-400 cursor-pointer'
    return 'bg-gray-100 hover:bg-gray-200 cursor-pointer'
  }

  const filteredMachines = machines.filter((m) => {
    if (!search) return true
    const q = search.toLowerCase()
    return m.machine_id?.toLowerCase().includes(q) || m.machine_name?.toLowerCase().includes(q)
  })

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Weekly Maintenance Plan" subtitle="Click a Cell to Schedule  |  Green = Completed, Amber = Planned" />
      <ActionToolbar
        showCrudButtons={false}
        showExport={false}
      />
      <div className="flex-1 overflow-auto p-6 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded mb-4">
            {error}
          </div>
        )}

        <div className="relative mb-3 w-full max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Machine ID / Name..."
            className="h-9 w-full rounded-lg border border-[#CBDAEE] bg-white pl-9 pr-3 text-[13.5px] text-slate-800 placeholder:text-slate-400 focus:border-[#1669E0] focus:outline-none focus:ring-2 focus:ring-[#1669E0]/20"
          />
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-md overflow-x-auto">
            <table className="text-sm border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-bmlhsky border-b border-gray-200 px-4 py-2.5 text-left font-semibold text-bmlhnavy flex items-center gap-2">
                    <CalendarRange size={16} /> Machine
                  </th>
                  {weeks.map((w) => (
                    <th key={w} className="border-b border-gray-200 px-2 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMachines.map((m) => (
                  <tr key={m.machine_id} className="border-t border-gray-100">
                    <td className="sticky left-0 bg-white px-4 py-2 font-medium text-gray-700 whitespace-nowrap">
                      {m.machine_id} — {m.machine_name}
                    </td>
                    {weeks.map((w) => {
                      const cell = findCell(m.machine_id, w)
                      const busy = busyCell === `${m.machine_id}-${w}`
                      return (
                        <td key={w} className="px-1 py-1">
                          <button
                            onClick={() => handleCellClick(m.machine_id, w)}
                            disabled={busy || cell?.status === 'Completed'}
                            title={cell?.status ?? 'Unplanned'}
                            className={`w-8 h-8 rounded ${cellClasses(cell)} disabled:opacity-60`}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {filteredMachines.length === 0 && (
                  <tr>
                    <td colSpan={weeks.length + 1} className="px-4 py-6 text-center text-gray-400">
                      {machines.length === 0 ? 'No machines defined yet.' : 'No machines match your search.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
