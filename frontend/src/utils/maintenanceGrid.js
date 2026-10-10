// One cell of the Maintenance Planning grid (machine × Monday-start week).
// Completed = any checklist visit logged for the machine that week (planned
// or not); Planned = a plan row for the week; Due = the machine's schedule
// Next Due date falls in the week. Completed wins over Planned and Due.

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function inWeek(dateIso, weekStartIso) {
  if (!dateIso) return false
  const d = String(dateIso).slice(0, 10)
  return d >= weekStartIso && d <= addDays(weekStartIso, 6)
}

export function weekCellState({ machineId, week, planStatus = [], logs = [], schedules = [] }) {
  const plan = planStatus.find((p) => p.machine_id === machineId && p.planned_week_start_date === week)
  const visit = logs.find((l) => l.machine_id === machineId && inWeek(l.log_date, week))
  const schedule = schedules.find((s) => s.machine_id === machineId && inWeek(s.next_maintenance_due, week))
  const dueText = schedule ? `Next due ${String(schedule.next_maintenance_due).slice(0, 10)}` : ''
  if (visit || plan?.status === 'Completed') {
    const done = visit ? `Completed (visit ${String(visit.log_date).slice(0, 10)})` : 'Completed'
    return { status: 'Completed', planId: plan?.plan_id ?? null, title: [done, dueText].filter(Boolean).join(' · ') }
  }
  if (plan) return { status: 'Planned', planId: plan.plan_id, title: ['Planned', dueText].filter(Boolean).join(' · ') }
  if (schedule) return { status: 'Due', planId: null, title: `${dueText} -- click to plan` }
  return { status: null, planId: null, title: 'Unplanned -- click to plan' }
}
