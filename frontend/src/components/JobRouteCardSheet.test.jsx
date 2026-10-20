import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { JobRouteCardBody } from './JobRouteCardSheet'

const header = { jc_no: 'JC-003', prd_no: 'PRD-003', batch_qty: 200, shift_hours: 11, po_number: '5527000387', batch: 'Batch 1', part_serial_number: 'PKH2-0357', part_name: 'HPV22 Rotor', part_drawing_reference_number: 'PKH2-0357-0-5' }
const rows = [
  { id: 1, seq: 10, stage_no: 1, operation: 'Cutting', machine: 'Cuttng Mc 2', type: 'Internal', cycle_time_min: 1, lead_time_days: '', shifts_planned: 1, job_order_no: '', date: '2026-10-20', status: 'Completed' },
  { id: 2, seq: 20, stage_no: 2, operation: 'Heat Treatment', machine: '', type: 'Outsourced', cycle_time_min: '', lead_time_days: 3, shifts_planned: '', job_order_no: 'DC-001', date: '2026-10-21', status: 'Received (196 of 196 back)' },
]
const render = (blank) => renderToStaticMarkup(createElement(JobRouteCardBody, { header, rows, blank }))

describe('JobRouteCardBody (shared by both print variants)', () => {
  it('blank: no dates or statuses, all other fields, Date / Production Status headers kept', () => {
    const html = render(true)
    for (const v of ['2026-10-20', '2026-10-21', 'Completed', 'Received (196 of 196 back)']) expect(html).not.toContain(v)
    for (const v of ['JC-003', 'PRD-003', '5527000387', 'Batch 1', 'PKH2-0357-0-5', 'HPV22 Rotor', '>Stage<', '>Operation<', '>Cutting<', 'Cuttng Mc 2', 'Outsourced', 'DC-001', '>Date<', '>Production Status<']) expect(html).toContain(v)
  })
  it('with status: dates and statuses filled', () => {
    const html = render(false)
    for (const v of ['2026-10-20', '2026-10-21', 'Completed', 'Received (196 of 196 back)']) expect(html).toContain(v)
  })
  it('the on-screen sheet always renders with status; the picker only feeds Print / PDF', () => {
    const src = readFileSync(new URL('./JobRouteCardSheet.jsx', import.meta.url), 'utf8')
    expect(src).toContain('<JobRouteCardBody header={header} rows={rows} />')
    expect(src).not.toMatch(/<JobRouteCardBody[^>]*blank=/)
    expect(src).toContain('printJobRouteCard({ header, rows, blank })')
    expect(src).toContain("useState('blank')")
  })
})
