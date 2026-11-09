// "Needs attention" reminders (frontend only). Pure logic -- data loading
// lives in components/alerts/alertSources.js.
//
// An alert source = { key, title, roles, load(), toItems(data, today) }.
// An item = { id, text, open: { topKey, subKey, mode } }.

export const ALERT_ROLES = ['supervisor', 'admin']

export function canSeeAlerts(role) {
  return ALERT_ROLES.includes(role)
}

function dayNumber(iso) {
  if (!iso) return null
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return Date.UTC(y, m - 1, d) / 86400000
}

/** Whole days from a to b (b - a), or null when either is missing. */
export function daysBetween(a, b) {
  const x = dayNumber(a)
  const y = dayNumber(b)
  return x === null || y === null ? null : y - x
}

export function ddmmyyyy(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}-${m}-${y}`
}

/** Local today as YYYY-MM-DD. */
export function todayIso(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Open DCs past their expected receipt date ("job order status".is_overdue,
 * open; the view already drops voided DCs), most overdue first.
 * Lead time = Job Work Master lead_time_days, else expected - dispatch date.
 * Pending = balance_qty (sent - received).
 */
export function overdueDcItems({ statusRows = [], vendors = [], orders = [], jobWorkTypes = [], today = todayIso() } = {}) {
  const vendorName = new Map(vendors.map((v) => [v.vendor_id, v.vendor_name]))
  const orderByPrd = new Map(orders.map((o) => [o.prd_no, o]))
  const leadByCode = new Map(jobWorkTypes.map((j) => [j.job_work_code, j.lead_time_days]))
  return statusRows
    .filter((r) => r.is_open && r.is_overdue)
    .map((r) => {
      const late = Math.max(1, daysBetween(r.expected_receipt_date, today) ?? 1)
      const masterLead = leadByCode.get(r.job_work_code)
      const lead = masterLead !== null && masterLead !== undefined && masterLead !== ''
        ? Number(masterLead)
        : daysBetween(r.dispatch_date, r.expected_receipt_date)
      const order = orderByPrd.get(r.prd_no)
      const part = order?.part_serial_number
        ? (order.part_name ? `${order.part_serial_number} – ${order.part_name}` : order.part_serial_number)
        : (r.prd_no ?? '—')
      const pending = Number(r.balance_qty ?? Number(r.qty) - Number(r.qty_received ?? 0)) || 0
      const leadText = lead === null || Number.isNaN(lead) ? '' : `, lead time ${plural(lead, 'day')}`
      return {
        id: `dc:${r.dc_no}`,
        late,
        text: `${r.dc_no} · ${vendorName.get(r.vendor_id) ?? r.vendor_id ?? '—'} · ${part} · overdue by ${plural(late, 'day')} (expected ${ddmmyyyy(r.expected_receipt_date)}${leadText}) · ${pending} pcs`,
        open: { topKey: 'job-order', subKey: 'receipt', mode: `dc:${r.dc_no}` },
      }
    })
    .sort((a, b) => b.late - a.late || a.id.localeCompare(b.id, undefined, { numeric: true }))
}

/** DC number from a Jobwork Receipt open mode ("dc:DC-004"), else null. */
export function dcFromMode(mode) {
  return typeof mode === 'string' && mode.startsWith('dc:') ? mode.slice(3) : null
}

/**
 * Runs every source the role may see. A failing source is skipped (logged)
 * and never blocks the others or the app. Returns [{ key, title, items }],
 * empty groups left out.
 */
export async function loadAlertGroups(role, sources, today = todayIso()) {
  const allowed = sources.filter((s) => (s.roles ?? ALERT_ROLES).includes(role))
  const groups = await Promise.all(
    allowed.map(async (s) => {
      try {
        return { key: s.key, title: s.title, items: s.toItems(await s.load(), today) }
      } catch (e) {
        console.warn(`Alert source ${s.key} failed`, e)
        return { key: s.key, title: s.title, items: [] }
      }
    })
  )
  return groups.filter((g) => g.items.length > 0)
}

export const alertCount = (groups) => groups.reduce((n, g) => n + g.items.length, 0)

// "Got it" = no pop-up again this browser session (per user). Storage can
// throw (private mode, blocked site data): then it is simply not remembered.
const gotItKey = (userId) => `bmlh.alerts.gotIt.${userId ?? 'anon'}`

export function hasDismissedAlerts(userId, storage = globalThis.sessionStorage) {
  try {
    return storage?.getItem(gotItKey(userId)) === '1'
  } catch {
    return false
  }
}

export function rememberDismissedAlerts(userId, storage = globalThis.sessionStorage) {
  try {
    storage?.setItem(gotItKey(userId), '1')
  } catch {
    // not remembered -- the pop-up may show again on the next Main Menu visit
  }
}
