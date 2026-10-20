// Pure logic for the Job Route Card sheet (Production > Production Route
// Card) and the per-part template (Masters > Route Card), kept outside the
// components so it's independently testable.

import { stageLabel } from './stageLabel'
import { stageMachineDisplay } from './machineEligibility'

/**
 * No. of Shifts Planned = ROUND(batch_qty x cycle_time_min / 60 / shift_hours),
 * minimum 1 (senior: normal rounding; a short batch still needs one shift).
 * Computed on screen, never stored. Blank ('') for
 * Outsourced stages and for any stage without a cycle time (e.g. Manual), or
 * when the card has no batch qty / shift hours.
 */
export function shiftsPlanned({ type, cycleTimeMin, batchQty, shiftHours }) {
  if (type === 'Outsourced') return ''
  const cycle = Number(cycleTimeMin)
  const batch = Number(batchQty)
  const hours = Number(shiftHours)
  if (!cycle || !batch || !hours) return ''
  return Math.max(1, Math.round((batch * cycle) / 60 / hours))
}

/** Job work lead time (days) for an Outsourced stage; '' otherwise. */
export function leadTimeDays(stage, jobWorkTypes) {
  if (stage.type !== 'Outsourced' || !stage.job_work_code) return ''
  return jobWorkTypes.find((j) => j.job_work_code === stage.job_work_code)?.lead_time_days ?? ''
}

/** Machine Master's machine_name for a stage; falls back to the id if the
 * machine isn't found, so the cell is never silently blank. */
export function machineName(machineId, machines = []) {
  if (!machineId) return ''
  return machines.find((m) => m.machine_id === machineId)?.machine_name ?? machineId
}

/** The five template ("yellow") columns for one stage / Cycle Time Master row. */
export function templateRow(stage, jobWorkTypes, machines = []) {
  const outsourced = stage.type === 'Outsourced'
  return {
    // "Stage N – operation" when the row has a sequence (route card stages
    // and Cycle Time Master rows both do), plain operation otherwise.
    operation: stage.seq != null && stage.seq !== '' ? stageLabel(stage) : (stage.operation ?? ''),
    machine: outsourced ? '' : machineName(stage.machine_id, machines),
    type: stage.type ?? '',
    // Cycle time is blank on job-work rows -- the lead time column applies instead.
    cycle_time_min: outsourced ? '' : (stage.cycle_time_min ?? ''),
    lead_time_days: leadTimeDays(stage, jobWorkTypes),
  }
}

/** Sent / received totals of an outsourced stage's DCs ("job order status" rows). */
export function stageDcTotals(dcs) {
  return {
    sent: dcs.reduce((a, d) => a + (Number(d.qty) || 0), 0),
    back: dcs.reduce((a, d) => a + (Number(d.qty_received) || 0), 0),
  }
}

/** Outsourced stage status (migration 031 -- a stage can be split across
 * vendors): Not Sent (no DC) / Sent / Partially Received / Received. */
export function outsourcedStageLabel(stage, dcs) {
  if (stage.status === 'Received') return 'Received'
  if (!dcs.length) return 'Not Sent'
  return stageDcTotals(dcs).back === 0 ? 'Sent' : 'Partially Received'
}

/** "300 of 500 back" for an outsourced stage's DCs ('' when none). */
export function stageBackLabel(dcs) {
  if (!dcs.length) return ''
  const { sent, back } = stageDcTotals(dcs)
  return `${back.toLocaleString('en-IN')} of ${sent.toLocaleString('en-IN')} back`
}

/** Job Route Card status text for an outsourced stage: the stored status
 * until a DC exists, then "<label> (N of M back)". */
export function outsourcedStageStatus(stage, dcs) {
  if (!dcs.length) return stage.status ?? ''
  return `${outsourcedStageLabel(stage, dcs)} (${stageBackLabel(dcs)})`
}

/**
 * Full Job Route Card rows for one PRD: template columns plus shifts planned,
 * job order number(s) (every DC of the stage, oldest first), date (stage
 * actual_date) and production status (stage status; outsourced stages show
 * their DC progress, see outsourcedStageStatus).
 */
export function buildJobRouteCardRows({ card, stages, jobWorkTypes, dispatches, machines = [], logs = [] }) {
  return [...stages]
    .sort((a, b) => a.seq - b.seq)
    .map((s) => {
      const stageDcs = dispatches
        .filter((d) => d.stage_id === s.id)
        .sort((a, b) => String(a.dispatch_date ?? '').localeCompare(String(b.dispatch_date ?? '')) || String(a.dc_no).localeCompare(String(b.dc_no)))
      return {
        id: s.id,
        seq: s.seq,
        ...templateRow(s, jobWorkTypes, machines),
        shifts_planned: shiftsPlanned({
          type: s.type,
          cycleTimeMin: s.cycle_time_min,
          batchQty: card?.batch_qty,
          shiftHours: card?.shift_hours,
        }),
        job_order_no: stageDcs.map((d) => d.dc_no).join(', '),
        date: s.actual_date ?? '',
        status: s.type === 'Outsourced' ? outsourcedStageStatus(s, stageDcs) : s.status ?? '',
        // Status copy only: "CNC 2 (MC-005) (planned MC-004)" when a log ran on a substitute.
        machine_actual: machineActualText(s, logs.filter((l) => l.stage_id === s.id), machines),
      }
    })
}

/** Machine text for the status copy: the planned machine name, or the
 * actual machine name(s) + "(planned MC-xxx)" when a log ran elsewhere. */
export function machineActualText(stage, stageLogs, machines = []) {
  if (stage.type !== 'Internal') return ''
  const text = stageMachineDisplay({ plannedId: stage.machine_id, logs: stageLogs })
  if (text === (stage.machine_id ?? '')) return machineName(stage.machine_id, machines)
  const actualIds = [...new Set(stageLogs.map((l) => l.machine_id).filter(Boolean))].sort()
  return `${actualIds.map((id) => machineName(id, machines)).join(', ')} (planned ${stage.machine_id})`
}

export const TEMPLATE_COLUMNS = [
  { key: 'operation', label: 'Operations Stage' },
  { key: 'machine', label: 'Machine' },
  { key: 'type', label: 'Type of Process' },
  { key: 'cycle_time_min', label: 'Cycle Time (min)' },
  { key: 'lead_time_days', label: 'Job Work Lead Time (days)' },
]

export const JOB_ROUTE_CARD_COLUMNS = [
  ...TEMPLATE_COLUMNS,
  { key: 'shifts_planned', label: 'No. of Shifts Planned' },
  { key: 'job_order_no', label: 'Job Order Number' },
  { key: 'date', label: 'Date' },
  { key: 'status', label: 'Production Status' },
]

/** Columns left empty on the "Blank – for shop floor" print (filled in by hand). */
export const BLANK_COLUMN_KEYS = new Set(['date', 'status'])

/** Print variants of the Job Route Card. Default = blank (shop floor copy). */
export const ROUTE_CARD_VARIANTS = [
  { value: 'blank', label: 'Blank – for shop floor' },
  { value: 'status', label: 'With current status' },
]

/** Cell value for a stage row; '' for the hand-filled columns on the blank
 * variant. The status copy shows the actual machine (+ planned) in Machine. */
export function routeCardCell(row, key, blank = false) {
  if (blank && BLANK_COLUMN_KEYS.has(key)) return ''
  if (!blank && key === 'machine' && row.machine_actual) return row.machine_actual
  return row[key]
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Print-window HTML laid out like BMLH's paper Job Route Card sheet.
 * blank: Date and Production Status left empty (headers + borders kept) with
 * taller rows for handwriting; everything else as with the status copy. */
export function jobRouteCardPrintHtml({ header, rows, blank = false }) {
  const templateKeys = new Set(TEMPLATE_COLUMNS.map((c) => c.key))
  const cell = (label, value) =>
    `<td class="lbl">${escapeHtml(label)}</td><td class="val">${escapeHtml(value)}</td>`
  const head = JOB_ROUTE_CARD_COLUMNS.map(
    (c) => `<th class="${templateKeys.has(c.key) ? 'yel' : ''}${blank && BLANK_COLUMN_KEYS.has(c.key) ? ` hand-${c.key}` : ''}">${escapeHtml(c.label)}</th>`
  ).join('')
  const body = rows
    .map(
      (r) =>
        `<tr>${JOB_ROUTE_CARD_COLUMNS.map(
          (c) => `<td class="${templateKeys.has(c.key) ? 'yel' : ''}">${escapeHtml(routeCardCell(r, c.key, blank))}</td>`
        ).join('')}</tr>`
    )
    .join('')
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(header.jc_no || 'Job Route Card')}</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      body { font-family: Arial, sans-serif; color: #000; margin: 0; padding: 16px; }
      .top { display: flex; justify-content: space-between; align-items: center; border: 1.5px solid #000; border-bottom: 0; padding: 8px 10px; }
      .top h1 { font-size: 18px; margin: 0; letter-spacing: 0.5px; }
      .top .jc { font-size: 13px; font-weight: bold; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      td, th { border: 1px solid #000; padding: 5px 6px; text-align: left; vertical-align: top; }
      .info td.lbl { font-weight: bold; width: 13%; background: #f2f2f2; }
      .info td.val { width: 20%; }
      .info { border: 1.5px solid #000; }
      .stages { margin-top: 10px; border: 1.5px solid #000; }
      .stages th { font-weight: bold; background: #e6e6e6; }
      .stages .yel { background: #fff2b3; }
      .stages.blank td { height: 34px; }
      .stages.blank th.hand-date { width: 10%; }
      .stages.blank th.hand-status { width: 16%; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    </style>
  </head>
  <body>
    <div class="top"><h1>JOB ROUTE CARD</h1><div class="jc">JC No: ${escapeHtml(header.jc_no)}</div></div>
    <table class="info">
      <tr>${cell('PRD Number', header.prd_no)}${cell('Batch Qty', header.batch_qty)}${cell('Shift Hours', header.shift_hours)}</tr>
      <tr>${cell('PO Number', header.po_number)}${cell('Batch', header.batch)}${cell('', '')}</tr>
      <tr>${cell('Part Serial Number', header.part_serial_number)}${cell('Part Name', header.part_name)}${cell('Drawing Reference Number', header.part_drawing_reference_number)}</tr>
    </table>
    <table class="stages${blank ? ' blank' : ''}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <script>window.onload = () => window.print()</script>
  </body>
</html>`
}

/** Opens the sheet in a print window; the browser's "Save as PDF" makes the PDF. */
export function printJobRouteCard({ header, rows, blank = false }) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(jobRouteCardPrintHtml({ header, rows, blank }))
  win.document.close()
}
