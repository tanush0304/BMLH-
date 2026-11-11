import { describe, expect, it } from 'vitest'
import { buildJobRouteCardRows, jobRouteCardPrintHtml, outsourcedStageLabel, outsourcedStageStatus, shiftsPlanned, templateRow, routeCardCell, ROUTE_CARD_VARIANTS } from './jobRouteCard'

const jobWorkTypes = [{ job_work_code: 'HT', lead_time_days: 5 }]

describe('shiftsPlanned', () => {
  it('is ROUND(batch x cycle / 60 / shift hours), minimum 1', () => {
    // 100 x 9 / 60 / 8 = 1.875 -> 2
    expect(shiftsPlanned({ type: 'Internal', cycleTimeMin: 9, batchQty: 100, shiftHours: 8 })).toBe(2)
    // 100 x 6 / 60 / 8 = 1.25 -> 1 (normal rounding)
    expect(shiftsPlanned({ type: 'Internal', cycleTimeMin: 6, batchQty: 100, shiftHours: 8 })).toBe(1)
    // E2E JC-004: 20 x 6 / 60 / 8 = 0.25 -> 0 -> minimum 1
    expect(shiftsPlanned({ type: 'Internal', cycleTimeMin: 6, batchQty: 20, shiftHours: 8 })).toBe(1)
    // 48 x 5 / 60 / 8 = 0.5 -> 1
    expect(shiftsPlanned({ type: 'Internal', cycleTimeMin: 5, batchQty: 48, shiftHours: 8 })).toBe(1)
    // 400 x 6 / 60 / 8 = 5 -> 5; 520 x 6 / 60 / 8 = 6.5 -> 7
    expect(shiftsPlanned({ type: 'Internal', cycleTimeMin: 6, batchQty: 400, shiftHours: 8 })).toBe(5)
    expect(shiftsPlanned({ type: 'Internal', cycleTimeMin: 6, batchQty: 520, shiftHours: 8 })).toBe(7)
    // 48 x 5 / 60 / 8 = 0.5 -> 1
    expect(shiftsPlanned({ type: 'Internal', cycleTimeMin: 5, batchQty: 48, shiftHours: 8 })).toBe(1)
  })

  it('is blank for Outsourced rows and rows without a cycle time', () => {
    expect(shiftsPlanned({ type: 'Outsourced', cycleTimeMin: 9, batchQty: 100, shiftHours: 8 })).toBe('')
    expect(shiftsPlanned({ type: 'Manual', cycleTimeMin: null, batchQty: 100, shiftHours: 8 })).toBe('')
    expect(shiftsPlanned({ type: 'Internal', cycleTimeMin: 9, batchQty: 100, shiftHours: null })).toBe('')
  })
})

describe('templateRow', () => {
  it('shows lead time (not cycle time or machine) only on Outsourced rows', () => {
    expect(templateRow({ operation: 'Heat Treatment', type: 'Outsourced', job_work_code: 'HT', cycle_time_min: 3 }, jobWorkTypes))
      .toEqual({ operation: 'Heat Treatment', machine: '', type: 'Outsourced', cycle_time_min: '', lead_time_days: 5 })
    expect(templateRow({ operation: 'Turning', type: 'Internal', machine_id: 'CNC-01', cycle_time_min: 4 }, jobWorkTypes))
      .toEqual({ operation: 'Turning', machine: 'CNC-01', type: 'Internal', cycle_time_min: 4, lead_time_days: '' })
  })

  it('shows machine_name from Machine Master, falling back to the id', () => {
    const machines = [{ machine_id: 'CNC-01', machine_name: 'Ace Jobber XL' }]
    expect(templateRow({ type: 'Internal', machine_id: 'CNC-01' }, jobWorkTypes, machines).machine).toBe('Ace Jobber XL')
    expect(templateRow({ type: 'Internal', machine_id: 'CNC-99' }, jobWorkTypes, machines).machine).toBe('CNC-99')
  })
})

describe('buildJobRouteCardRows', () => {
  const card = { batch_qty: 100, shift_hours: 8 }
  const stages = [
    { id: 2, seq: 20, operation: 'Heat Treatment', type: 'Outsourced', job_work_code: 'HT', status: 'Received', actual_date: '2026-10-05' },
    { id: 1, seq: 10, operation: 'Turning', type: 'Internal', machine_id: 'CNC-01', cycle_time_min: 9, status: 'Completed', actual_date: '2026-10-02' },
    { id: 3, seq: 30, operation: 'Deburr', type: 'Manual', cycle_time_min: null, status: 'Pending', actual_date: null },
  ]
  const dispatches = [
    { dc_no: 'DC-004', stage_id: 2, dispatch_date: '2026-10-03', qty: 200, qty_received: 200 },
    { dc_no: 'DC-001', stage_id: 2, dispatch_date: '2026-10-01', qty: 300, qty_received: 100 },
  ]

  it('orders by seq and fills job order no, date and status from the stage', () => {
    const rows = buildJobRouteCardRows({ card, stages, jobWorkTypes, dispatches })
    // Separate columns: Stage = position (1, 2, 3 …, not seq 10/20/30) + plain Operation
    expect(rows.map((r) => [r.stage_no, r.operation])).toEqual([[1, 'Turning'], [2, 'Heat Treatment'], [3, 'Deburr']])
    expect(rows[0]).toMatchObject({ shifts_planned: 2, job_order_no: '', date: '2026-10-02', status: 'Completed' })
    // Split across two DCs: both listed oldest first, progress summed.
    expect(rows[1]).toMatchObject({ shifts_planned: '', lead_time_days: 5, job_order_no: 'DC-001, DC-004', status: 'Received (300 of 500 back)' })
    expect(rows[2]).toMatchObject({ shifts_planned: '', job_order_no: '', date: '', status: 'Pending' })
  })

  it('outsourced stage status: Pending until a DC, then Sent / Partially Received / Received with N of M back', () => {
    const stage = { status: 'Pending' }
    expect(outsourcedStageStatus(stage, [])).toBe('Pending')
    expect(outsourcedStageStatus(stage, [{ qty: 300, qty_received: null }, { qty: 200 }])).toBe('Sent (0 of 500 back)')
    expect(outsourcedStageStatus(stage, [{ qty: 300, qty_received: 300 }, { qty: 200, qty_received: 0 }])).toBe('Partially Received (300 of 500 back)')
    expect(outsourcedStageStatus({ status: 'Received' }, [{ qty: 42, qty_received: 40 }])).toBe('Received (40 of 42 back)')
    expect(outsourcedStageLabel(stage, [])).toBe('Not Sent')
  })

  it('print HTML carries the JC No and escapes values', () => {
    const html = jobRouteCardPrintHtml({
      header: { jc_no: 'JC-007', prd_no: 'PRD-001', part_name: 'Shaft <A>' },
      rows: buildJobRouteCardRows({ card, stages, jobWorkTypes, dispatches }),
    })
    expect(html).toContain('JC No: JC-007')
    expect(html).toContain('Shaft &lt;A&gt;')
    expect(html).toContain('No. of Shifts Planned')
  })

  const header = { jc_no: 'JC-007', prd_no: 'PRD-001', batch_qty: 100, shift_hours: 8, po_number: '5527000387', batch: 'Batch 1', part_serial_number: 'P-1', part_name: 'Rotor', part_drawing_reference_number: 'P-1-0-1' }
  const rows = () => buildJobRouteCardRows({ card, stages, jobWorkTypes, dispatches })

  it('blank print variant: no dates / statuses, every other field filled, headers kept, taller rows', () => {
    const html = jobRouteCardPrintHtml({ header, rows: rows(), blank: true })
    for (const v of ['2026-10-02', '2026-10-05', 'Completed', 'Received (300 of 500 back)', 'Pending']) expect(html).not.toContain(v)
    for (const v of ['JC No: JC-007', 'PRD-001', '5527000387', 'Batch 1', 'P-1-0-1', 'Rotor', '<td class="">1</td>', '>Turning<', 'CNC-01', 'Outsourced', '>9<', '>5<', '>2<', 'DC-001, DC-004']) expect(html).toContain(v)
    expect(html).toContain('<th class=" hand-date">Date</th>')
    expect(html).toContain('<th class=" hand-status">Production Status</th>')
    expect(html).toContain('class="stages blank"')
    expect(html).toContain('size: A4 landscape')
  })

  it('status print variant is unchanged (dates + statuses filled; default)', () => {
    const html = jobRouteCardPrintHtml({ header, rows: rows() })
    expect(html).toBe(jobRouteCardPrintHtml({ header, rows: rows(), blank: false }))
    for (const v of ['2026-10-02', 'Completed', 'Received (300 of 500 back)', 'Pending']) expect(html).toContain(v)
    expect(html).toContain('class="stages"')
    expect(html).not.toContain('stages blank')
    expect(html).toContain('<th class="">Date</th>')
  })

  it('routeCardCell blanks only Date and Production Status', () => {
    const r = rows()[0]
    expect(routeCardCell(r, 'date', true)).toBe('')
    expect(routeCardCell(r, 'status', true)).toBe('')
    expect(routeCardCell(r, 'machine', true)).toBe('CNC-01')
    expect(routeCardCell(r, 'date', false)).toBe('2026-10-02')
    expect(ROUTE_CARD_VARIANTS[0].value).toBe('blank')
  })
})
