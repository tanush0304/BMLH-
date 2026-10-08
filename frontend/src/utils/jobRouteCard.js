// Pure logic for the Job Route Card sheet (Production > Production Route
// Card) and the per-part template (Masters > Route Card), kept outside the
// components so it's independently testable.

/**
 * No. of Shifts Planned = ROUND(batch_qty x cycle_time_min / 60 / shift_hours),
 * normal rounding (half up). Computed on screen, never stored. Blank ('') for
 * Outsourced stages and for any stage without a cycle time (e.g. Manual), or
 * when the card has no batch qty / shift hours.
 */
export function shiftsPlanned({ type, cycleTimeMin, batchQty, shiftHours }) {
  if (type === 'Outsourced') return ''
  const cycle = Number(cycleTimeMin)
  const batch = Number(batchQty)
  const hours = Number(shiftHours)
  if (!cycle || !batch || !hours) return ''
  return Math.round((batch * cycle) / 60 / hours)
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
    operation: stage.operation ?? '',
    machine: outsourced ? '' : machineName(stage.machine_id, machines),
    type: stage.type ?? '',
    // Cycle time is blank on job-work rows -- the lead time column applies instead.
    cycle_time_min: outsourced ? '' : (stage.cycle_time_min ?? ''),
    lead_time_days: leadTimeDays(stage, jobWorkTypes),
  }
}

/**
 * Full Job Route Card rows for one PRD: template columns plus shifts planned,
 * job order number (dc_no of the stage's latest dispatch, if any), date
 * (stage actual_date) and production status (stage status).
 */
export function buildJobRouteCardRows({ card, stages, jobWorkTypes, dispatches, machines = [] }) {
  return [...stages]
    .sort((a, b) => a.seq - b.seq)
    .map((s) => {
      const latestDispatch = dispatches
        .filter((d) => d.stage_id === s.id)
        .sort((a, b) => String(b.dispatch_date ?? '').localeCompare(String(a.dispatch_date ?? '')))[0]
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
        job_order_no: latestDispatch?.dc_no ?? '',
        date: s.actual_date ?? '',
        status: s.status ?? '',
      }
    })
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Print-window HTML laid out like BMLH's paper Job Route Card sheet. */
export function jobRouteCardPrintHtml({ header, rows }) {
  const templateKeys = new Set(TEMPLATE_COLUMNS.map((c) => c.key))
  const cell = (label, value) =>
    `<td class="lbl">${escapeHtml(label)}</td><td class="val">${escapeHtml(value)}</td>`
  const head = JOB_ROUTE_CARD_COLUMNS.map(
    (c) => `<th class="${templateKeys.has(c.key) ? 'yel' : ''}">${escapeHtml(c.label)}</th>`
  ).join('')
  const body = rows
    .map(
      (r) =>
        `<tr>${JOB_ROUTE_CARD_COLUMNS.map(
          (c) => `<td class="${templateKeys.has(c.key) ? 'yel' : ''}">${escapeHtml(r[c.key])}</td>`
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
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    </style>
  </head>
  <body>
    <div class="top"><h1>JOB ROUTE CARD</h1><div class="jc">JC No: ${escapeHtml(header.jc_no)}</div></div>
    <table class="info">
      <tr>${cell('PRD Number', header.prd_no)}${cell('Batch Qty', header.batch_qty)}${cell('Shift Hours', header.shift_hours)}</tr>
      <tr>${cell('Part Serial Number', header.part_serial_number)}${cell('Part Name', header.part_name)}${cell('Drawing Reference Number', header.part_drawing_reference_number)}</tr>
    </table>
    <table class="stages"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <script>window.onload = () => window.print()</script>
  </body>
</html>`
}

/** Opens the sheet in a print window; the browser's "Save as PDF" makes the PDF. */
export function printJobRouteCard({ header, rows }) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(jobRouteCardPrintHtml({ header, rows }))
  win.document.close()
}
