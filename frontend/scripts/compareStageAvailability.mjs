// One-off check for migration 031: stage_dispatch_remaining (SQL) must equal
// computeStageAvailability (frontend) for EVERY stage. Read-only.
//   cd frontend && node scripts/compareStageAvailability.mjs
// Logs in as the TEST supervisor from .env.test; Supabase URL/key from .env.
// Builds the JS inputs the same way the screens do (getStageAggregatesForPrd,
// getWipAggregatesForPrd, stage 1 = the PRD qty from "production orders", migration 030).
import fs from 'node:fs'
import { register } from 'node:module'
import { createClient } from '@supabase/supabase-js'

// The app's sources import siblings without ".js" (Vite resolves that);
// teach Node the same before loading them.
register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function resolve(spec, ctx, next) {
      try { return await next(spec, ctx) } catch (e) {
        if (spec.startsWith('.') && !/\.[cm]?js$/.test(spec)) return next(spec + '.js', ctx)
        throw e
      }
    }`)
)
const { computeStageAvailability } = await import('../src/utils/calculations.js')
const { acceptedFromHour } = await import('../src/utils/qtyLimits.js')

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

const { error: authError } = await supabase.auth.signInWithPassword({ email: env.TEST_EMAIL, password: env.TEST_PASSWORD })
if (authError) throw authError

const [stages, orders, logs, hours, dispatches, receipts, wip] = await Promise.all([
  all('production route card stages'),
  all('production orders', 'prd_no, prd_qty'),
  all('production logs', 'id, prd_no, stage_id, planned_qty'),
  all('production log hours', 'log_id, qty_produced, qty_rejected, qty_rework'),
  all('job order dispatch', 'dc_no, prd_no, stage_id, qty'),
  all('job order receipt', 'dc_no, qty_received'),
  all('wip transactions', 'prd_no, transaction_type, nature_of_operation_stage_id, target_stage_id, qty'),
])

// Same aggregation as getStageAggregatesForPrd / getWipAggregatesForPrd.
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
const dcByNo = new Map(dispatches.map((d) => [d.dc_no, d]))
for (const d of dispatches) bucket(d.stage_id).consumed += Number(d.qty ?? 0)
for (const r of receipts) {
  const d = dcByNo.get(r.dc_no)
  if (!d) continue
  bucket(d.stage_id).output += Number(r.qty_received ?? 0)
  bucket(d.stage_id).accepted += Number(r.qty_received ?? 0)
}
const wipByPrd = new Map()
for (const t of wip) {
  const w = wipByPrd.get(t.prd_no) ?? { receiptedFrom: {}, issuedTo: {} }
  const qty = Number(t.qty ?? 0)
  if (t.transaction_type === 'Receipt') w.receiptedFrom[t.nature_of_operation_stage_id] = (w.receiptedFrom[t.nature_of_operation_stage_id] ?? 0) + qty
  else if (t.transaction_type === 'Issue') w.issuedTo[t.target_stage_id] = (w.issuedTo[t.target_stage_id] ?? 0) + qty
  wipByPrd.set(t.prd_no, w)
}

const stagesByPrd = new Map()
for (const s of stages) stagesByPrd.set(s.prd_no, [...(stagesByPrd.get(s.prd_no) ?? []), s])

const diffs = []
let checked = 0
for (const [prdNo, prdStages] of stagesByPrd) {
  const orderQty = Number(orders.find((o) => o.prd_no === prdNo)?.prd_qty ?? 0)
  const js = computeStageAvailability(prdStages, orderQty, aggregates, wipByPrd.get(prdNo) ?? {})
  for (const s of prdStages) {
    const { data: sql, error } = await supabase.rpc('stage_dispatch_remaining', { p_stage_id: s.id })
    if (error) throw new Error(`stage ${s.id}: ${error.message}`)
    checked += 1
    if (Number(sql) !== Number(js[s.id])) diffs.push({ prd_no: prdNo, stage_id: s.id, seq: s.seq, type: s.type, sql: Number(sql), js: js[s.id] })
  }
}

console.log(`Stages checked: ${checked} across ${stagesByPrd.size} PRDs`)
console.log(diffs.length ? `DIFFERENCES: ${diffs.length}` : 'Differences: 0')
if (diffs.length) console.table(diffs)
await supabase.auth.signOut()
process.exit(diffs.length ? 1 : 0)
