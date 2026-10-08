import { describe, expect, it } from 'vitest'
import { buildJobRouteCardRows, jobRouteCardPrintHtml, shiftsPlanned, templateRow } from './jobRouteCard'

const jobWorkTypes = [{ job_work_code: 'HT', lead_time_days: 5 }]

describe('shiftsPlanned', () => {
  it('is ROUND(batch x cycle / 60 / shift hours) with normal rounding', () => {
    // 100 x 9 / 60 / 8 = 1.875 -> 2
    expect(shiftsPlanned({ type: 'Internal', cycleTimeMin: 9, batchQty: 100, shiftHours: 8 })).toBe(2)
    // 100 x 6 / 60 / 8 = 1.25 -> 1 (not rounded up)
    expect(shiftsPlanned({ type: 'Internal', cycleTimeMin: 6, batchQty: 100, shiftHours: 8 })).toBe(1)
    // exactly .5 rounds half up: 48 x 5 / 60 / 8 = 0.5 -> 1
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
    { dc_no: 'DC-001', stage_id: 2, dispatch_date: '2026-10-01' },
    { dc_no: 'DC-004', stage_id: 2, dispatch_date: '2026-10-03' },
  ]

  it('orders by seq and fills job order no, date and status from the stage', () => {
    const rows = buildJobRouteCardRows({ card, stages, jobWorkTypes, dispatches })
    expect(rows.map((r) => r.operation)).toEqual(['Turning', 'Heat Treatment', 'Deburr'])
    expect(rows[0]).toMatchObject({ shifts_planned: 2, job_order_no: '', date: '2026-10-02', status: 'Completed' })
    expect(rows[1]).toMatchObject({ shifts_planned: '', lead_time_days: 5, job_order_no: 'DC-004', status: 'Received' })
    expect(rows[2]).toMatchObject({ shifts_planned: '', job_order_no: '', date: '', status: 'Pending' })
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
})
