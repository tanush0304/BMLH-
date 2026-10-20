// Check for migration 036: every new SQL ceiling function must equal its JS
// twin for every live material / PRD / stage. READ-ONLY: SELECTs and rpc()
// calls of the 036 functions only.
//   cd frontend && node scripts/compareQtyLimits.mjs
// Logs in as the TEST supervisor from .env.test; Supabase URL/key from .env.
// Builds the JS inputs the same way the screens do (getStageAggregatesForPrd,
// listWipTransactionsForPrd, the FG / RM views), voided rows (034) excluded.
import fs from 'node:fs'
import { register } from 'node:module'
import { createClient } from '@supabase/supabase-js'

// The app's sources import siblings without ".js" (Vite resolves that).
register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function resolve(spec, ctx, next) {
      try { return await next(spec, ctx) } catch (e) {
        if (spec.startsWith('.') && !/\.[cm]?js$/.test(spec)) return next(spec + '.js', ctx)
        throw e
      }
    }`)
)
const { acceptedFromHour, wipReceiptAvailable, fgReceiptLimits, stageAcceptedQty, lastStage } = await import('../src/utils/qtyLimits.js')

const readEnv = (f) =>
  Object.fromEntries(
    fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
      .split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/=(.*)/s).slice(0, 2))
  )
const env = { ...readEnv('.env'), ...readEnv('.env.test') }
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function all(table, columns = '*') {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) return out
  }
}
async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(`${fn}(${JSON.stringify(args)}): ${error.message}`)
  return Number(data)
}

const { error: authError } = await supabase.auth.signInWithPassword({ email: env.TEST_EMAIL, password: env.TEST_PASSWORD })
if (authError) throw authError

const [stages, prds, lines, logs, hours, dispatches, receipts, wip, rmBalance, fgStock, fgStatus, fgMaster] = await Promise.all([
  all('production route card stages'),
  all('production orders', 'prd_no, order_line_id, prd_qty'),
  all('customer orders', 'order_line_id, order_qty'),
  all('production logs', 'id, prd_no, stage_id, planned_qty'),
  all('production log hours', 'log_id, qty_produced, qty_rejected, qty_rework'),
  all('job order dispatch', 'dc_no, prd_no, stage_id, qty, voided_at'),
  all('job order receipt', 'dc_no, qty_received'),
  all('wip transactions', 'prd_no, transaction_type, nature_of_operation_stage_id, target_stage_id, qty'),
  all('raw material stock balance'),
  all('finished goods stock balance'),
  all('finished goods order status'),
  all('finished goods master', 'prd_no, order_line_id, receipts'),
])

// getStageAggregatesForPrd, all PRDs at once (voided DCs left out, as listDispatchesForPrd does).
const aggregates = {}
const bucket = (id) => (aggregates[id] ??= { output: 0, accepted: 0, consumed: 0 })
const logById = new Map(logs.map((l) => [l.id, l]))
for (const l of logs) bucket(l.stage_id).consumed += Number(l.planned_qty ?? 0)
for (const h of hours) {
  const l = logById.get(h.log_id)
  if (!l) continue
  bucket(l.stage_id).output += Number(h.qty_produced ?? 0)
  bucket(l.stage_id).accepted += acceptedFromHour(h)
}
const liveDcs = dispatches.filter((d) => !d.voided_at)
const dcByNo = new Map(liveDcs.map((d) => [d.dc_no, d]))
for (const d of liveDcs) bucket(d.stage_id).consumed += Number(d.qty ?? 0)
for (const r of receipts) {
  const d = dcByNo.get(r.dc_no)
  if (!d) continue
  bucket(d.stage_id).output += Number(r.qty_received ?? 0)
  bucket(d.stage_id).accepted += Number(r.qty_received ?? 0)
}

const diffs = []
const check = (what, key, js, sql) => {
  if (Math.abs(Number(js) - Number(sql)) > 1e-9) diffs.push({ what, key, js: Number(js), sql: Number(sql) })
}
let checked = 0

// RM Issue: JS uses the balance view's current_stock.
for (const b of rmBalance) {
  check('rm_issue_available', b.raw_material_code, b.current_stock, await rpc('rm_issue_available', { p_code: b.raw_material_code }))
  checked++
}

// WIP Receipt (availableToReceiveFor in WipReceiptScreen) for every stage.
const sumQty = (rows) => rows.reduce((s, t) => s + Number(t.qty ?? 0), 0)
for (const s of stages) {
  const prdStages = stages.filter((x) => x.prd_no === s.prd_no).sort((a, b) => a.seq - b.seq)
  const txns = wip.filter((t) => t.prd_no === s.prd_no)
  const next = prdStages[prdStages.findIndex((x) => x.id === s.id) + 1]
  const js = wipReceiptAvailable({
    stageAccepted: stageAcceptedQty(aggregates, s.id),
    alreadyReceived: sumQty(txns.filter((t) => t.transaction_type === 'Receipt' && String(t.nature_of_operation_stage_id) === String(s.id))),
    nextConsumed: next ? aggregates[next.id]?.consumed ?? 0 : 0,
    issuedIntoNext: next ? sumQty(txns.filter((t) => t.transaction_type === 'Issue' && String(t.target_stage_id) === String(next.id))) : 0,
  })
  check('wip_receipt_available', `${s.prd_no} stage ${s.seq} (${s.id})`, js, await rpc('wip_receipt_available', { p_prd_no: s.prd_no, p_stage_id: s.id }))
  checked++
}

// WIP Issue: JS uses "wip stock balance".current_stock; every (prd, stage) that has a pool row.
for (const b of await all('wip stock balance')) {
  check('wip_issue_available', `${b.prd_no} stage ${b.nature_of_operation_stage_id}`, b.current_stock,
    await rpc('wip_issue_available', { p_prd_no: b.prd_no, p_stage_id: b.nature_of_operation_stage_id }))
  checked++
}

// FG Receipt (fgReceiptLimits as on the FG screen) and FG Dispatch for every PRD.
const orderQtyOfLine = new Map(lines.map((l) => [l.order_line_id, l.order_qty]))
for (const p of prds) {
  const last = lastStage(stages.filter((x) => x.prd_no === p.prd_no))
  const fgPrd = fgMaster.find((r) => r.prd_no === p.prd_no)?.receipts ?? 0
  const lineFg = fgMaster.filter((r) => r.order_line_id === p.order_line_id).reduce((a, r) => a + Number(r.receipts ?? 0), 0)
  const limits = fgReceiptLimits({
    lastStageAccepted: last ? stageAcceptedQty(aggregates, last.id) : 0,
    orderQty: orderQtyOfLine.get(p.order_line_id),
    fgReceived: fgPrd,
    lineFgReceived: lineFg,
  })
  check('fg_receipt_by_production', p.prd_no, limits.fromProduction, await rpc('fg_receipt_by_production', { p_prd_no: p.prd_no }))
  check('fg_receipt_by_order', p.prd_no, limits.fromOrder, await rpc('fg_receipt_by_order', { p_prd_no: p.prd_no }))
  check('fg_receipt_available', p.prd_no, limits.max, await rpc('fg_receipt_available', { p_prd_no: p.prd_no }))

  const stock = Number(fgStock.find((b) => b.prd_no === p.prd_no)?.current_stock ?? 0)
  const balance = Number(fgStatus.find((s) => s.prd_no === p.prd_no)?.balance_to_dispatch ?? 0)
  check('fg_stock', p.prd_no, stock, await rpc('fg_stock', { p_prd_no: p.prd_no }))
  check('fg_line_balance', p.prd_no, balance, await rpc('fg_line_balance', { p_prd_no: p.prd_no }))
  check('fg_dispatch_available', p.prd_no, Math.max(0, Math.min(stock, balance)), await rpc('fg_dispatch_available', { p_prd_no: p.prd_no }))
  checked += 6
}

console.log(`Checked ${checked} values (${rmBalance.length} materials, ${stages.length} stages, ${prds.length} PRDs).`)
if (diffs.length === 0) {
  console.log('0 differences.')
} else {
  console.log(`${diffs.length} difference(s):`)
  console.table(diffs)
  process.exitCode = 1
}
