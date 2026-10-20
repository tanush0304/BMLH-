// Pure aggregation for Reports & Dashboard, over "report production hours"
// rows (one per log x date x shift x employee, migration 029).
//
// Ratios are always sum-over-sum (weighted), never an average of row %s:
//   efficiency % = 100 x sum(produced) / sum(standard_qty_per_hour x hour_rows)
//                  -- same formula as computeLiveLogTotals / "production log totals"
//   reject %     = 100 x sum(rejected) / sum(produced)   (produced incl. rejects)
//   rework %     = 100 x sum(rework)   / sum(produced)
import { IDLE_CATEGORIES } from './productionReport'

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function round1(n) {
  return Math.round(n * 10) / 10
}

/** 100 x part / whole, 1 dp; null when whole is 0 (shown as "—"). */
export function pct(part, whole) {
  return whole > 0 ? round1((100 * part) / whole) : null
}

/** Standard qty of a row: std qty per hour x logged hour rows (0 when the
 * log has no standard). */
export function standardQty(row) {
  return num(row.standard_qty_per_hour) * num(row.hour_rows)
}

/** Totals over any set of rows. */
export function totals(rows) {
  let produced = 0
  let rejected = 0
  let rework = 0
  let standard = 0
  for (const r of rows) {
    produced += num(r.produced)
    rejected += num(r.rejected)
    rework += num(r.rework)
    standard += standardQty(r)
  }
  return {
    produced,
    rejected,
    rework,
    standard,
    efficiency_pct: pct(produced, standard),
    reject_pct: pct(rejected, produced),
    rework_pct: pct(rework, produced),
  }
}

export function groupBy(rows, keyFn) {
  const map = new Map()
  for (const r of rows) {
    const k = keyFn(r)
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(r)
  }
  return map
}

/** Production Status detail: one row per log (PRD + stage + machine).
 * Required qty = the log's planned_qty (counted once per log, not per hour
 * group). Sorted by PRD then stage. */
export function productionStatusRows(rows) {
  const out = []
  for (const [logId, group] of groupBy(rows, (r) => r.log_id)) {
    const first = group[0]
    out.push({
      log_id: logId,
      prd_no: first.prd_no,
      stage_seq: first.stage_seq,
      stage_position: first.stage_position ?? null,
      operation: first.operation,
      machine_id: first.machine_id,
      machine_name: first.machine_name,
      required_qty: first.planned_qty == null ? null : num(first.planned_qty),
      shift_hours: first.shift_hours == null ? null : num(first.shift_hours),
      cycle_time_min: first.cycle_time_min == null ? null : num(first.cycle_time_min),
      ...totals(group),
    })
  }
  return out.sort(
    (a, b) =>
      String(a.prd_no).localeCompare(String(b.prd_no), undefined, { numeric: true }) ||
      num(a.stage_seq) - num(b.stage_seq) ||
      num(a.log_id) - num(b.log_id)
  )
}

/** KPI card values for Production Status. */
export function productionStatusKpis(rows) {
  const byLog = new Map()
  for (const r of rows) if (!byLog.has(r.log_id)) byLog.set(r.log_id, r)
  let required = 0
  for (const r of byLog.values()) required += num(r.planned_qty)
  return {
    orders: new Set(rows.map((r) => r.prd_no)).size,
    required,
    ...totals(rows),
  }
}

/** Daily Produced vs Standard, one point per date in `days` (zeros for
 * days with no entries, so the axis is continuous). */
export function dailyTrend(rows, days) {
  const byDate = groupBy(rows, (r) => r.log_date)
  return days.map((date) => {
    const t = totals(byDate.get(date) ?? [])
    return { date, produced: t.produced, standard: t.standard, efficiency_pct: t.efficiency_pct }
  })
}

// Manual Operations logs have no machine (machine_id null).
export const MANUAL_LABEL = 'Manual Operations'

/** Per-machine totals (efficiency, reject, rework), sorted by machine name;
 * Manual Operations logs form one group. */
export function byMachine(rows) {
  const out = []
  for (const [machineId, group] of groupBy(rows, (r) => r.machine_id ?? '')) {
    out.push({ machine_id: machineId, machine_name: machineId ? group[0].machine_name ?? machineId : MANUAL_LABEL, ...totals(group) })
  }
  return out.sort((a, b) => String(a.machine_name).localeCompare(String(b.machine_name), undefined, { numeric: true }))
}

/** Case-insensitive "contains" across the given keys. */
export function searchRows(rows, query, keys) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return rows
  return rows.filter((r) => keys.some((k) => String(r[k] ?? '').toLowerCase().includes(q)))
}

// ---------------------------------------------------------------- R2: Daily Machine

/** Machine-only rows (drops Manual Operations logs, which have no machine). */
export function machineRows(rows) {
  return rows.filter((r) => r.machine_id)
}

/** Change vs the previous value: % change for quantities, null when there is
 * no previous base. */
export function changePct(current, previous) {
  if (current == null || previous == null || previous === 0) return null
  return round1((100 * (current - previous)) / previous)
}

/** Difference in percentage points (for efficiency %). */
export function changePoints(current, previous) {
  if (current == null || previous == null) return null
  return round1(current - previous)
}

/** Daily Machine table / charts: one row per date with `byCategory[cat]` and
 * `total` totals, for the given dates and categories (in that order). */
export function dailyCategoryMatrix(rows, days, categories) {
  const byDate = groupBy(rows, (r) => r.log_date)
  return days.map((date) => {
    const dayRows = byDate.get(date) ?? []
    const byCat = groupBy(dayRows, (r) => r.machine_category)
    return {
      date,
      byCategory: Object.fromEntries(categories.map((c) => [c, totals(byCat.get(c) ?? [])])),
      total: totals(dayRows),
    }
  })
}

/** Daily Machine "Machine" filter: no machine = every row and category
 * (unchanged view); a machine = only its rows, and only its category (from
 * Machines Master, else from its rows, else 'Uncategorised'). */
export function machineView(rows, categories, machines, machineId) {
  if (!machineId) return { rows, categories }
  const mine = rows.filter((r) => r.machine_id === machineId)
  const master = machines.find((m) => m.machine_id === machineId)
  const category = master ? master.category || 'Uncategorised' : mine[0]?.machine_category ?? 'Uncategorised'
  return { rows: mine, categories: [category] }
}

/** Machines-master categories in display order (master order, de-duplicated),
 * plus 'Uncategorised' when any machine has none. */
export function machineCategories(machines) {
  const out = []
  for (const m of machines) {
    const c = m.category || 'Uncategorised'
    if (!out.includes(c)) out.push(c)
  }
  const named = out.filter((c) => c !== 'Uncategorised')
  return out.includes('Uncategorised') ? [...named, 'Uncategorised'] : named
}

// ---------------------------------------------------------------- R2: Downtime

/** Downtime types: setting time (per log, "report production setup") + the 7
 * idle categories. Lunch is a planned break: excluded from lost AND available. */
export const DOWNTIME_TYPES = [
  { key: 'setting_time_min', label: 'Setting Time' },
  ...IDLE_CATEGORIES.filter((c) => c.key !== 'lunch'),
]

/** Available minutes of an hour group = logged hour rows x 60 - lunch. */
export function availableMinutes(row) {
  return num(row.hour_rows) * 60 - num(row.lunch)
}

/** Downtime summary over hour rows + setup rows:
 *   { availableMin, lostMin, downtime_pct, machines, byType: [{ key, label, lostMin, pct, share }] }
 * pct = lost / available; share = lost of this type / all lost. */
export function downtimeSummary(hourRows, setupRows) {
  let availableMin = 0
  const lost = Object.fromEntries(DOWNTIME_TYPES.map((t) => [t.key, 0]))
  for (const r of hourRows) {
    availableMin += availableMinutes(r)
    for (const t of DOWNTIME_TYPES) if (t.key !== 'setting_time_min') lost[t.key] += num(r[t.key])
  }
  for (const s of setupRows) lost.setting_time_min += num(s.setting_time_min)
  const lostMin = Object.values(lost).reduce((a, b) => a + b, 0)
  return {
    availableMin,
    lostMin,
    downtime_pct: pct(lostMin, availableMin),
    machines: new Set(hourRows.map((r) => r.machine_id)).size,
    byType: DOWNTIME_TYPES.map((t) => ({
      key: t.key,
      label: t.label,
      lostMin: lost[t.key],
      pct: pct(lost[t.key], availableMin),
      share: pct(lost[t.key], lostMin),
    })),
  }
}

/** Lost hours per type per day: [{ date, [typeKey]: hours }]. */
export function downtimeTrend(hourRows, setupRows, days) {
  const hoursByDate = groupBy(hourRows, (r) => r.log_date)
  const setupByDate = groupBy(setupRows, (r) => r.log_date)
  return days.map((date) => {
    const s = downtimeSummary(hoursByDate.get(date) ?? [], setupByDate.get(date) ?? [])
    return { date, ...Object.fromEntries(s.byType.map((t) => [t.key, round1(t.lostMin / 60)])) }
  })
}

// ---------------------------------------------------------------- trend buckets

export const MAX_DAILY_POINTS = 62

/** A daily series ([{ date, ... }]) as-is with `label = dayLabel(date)`, or,
 * when longer than MAX_DAILY_POINTS days, rolled up to one point per month:
 * `sum` keys added, `last` keys = the month's last day (balances). */
export function trendBuckets(daily, { sum = [], last = [], dayLabel = (d) => d, monthLabel = (m) => m } = {}) {
  if (daily.length <= MAX_DAILY_POINTS) return daily.map((d) => ({ ...d, label: dayLabel(d.date) }))
  const out = []
  for (const [month, points] of groupBy(daily, (d) => d.date.slice(0, 7))) {
    const p = { date: month, label: monthLabel(month) }
    for (const k of sum) p[k] = round1(points.reduce((a, x) => a + num(x[k]), 0))
    for (const k of last) p[k] = points[points.length - 1][k]
    out.push(p)
  }
  return out
}
