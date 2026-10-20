import { describe, it, expect } from 'vitest'
import {
  normalizeDefect,
  defectLabels,
  filterComplaints,
  complaintKpis,
  complaintsByCustomer,
  complaintsByDefect,
  complaintsByPart,
  complaintsBySeverity,
} from './reportComplaints'

const ROWS = [
  { complaint_no: 'CMP-1', complaint_date: '2026-10-01', customer_id: 'C1', part_serial_number: 'P1', defect_problem: 'Burr', severity: 'Major', status: 'Open' },
  { complaint_no: 'CMP-2', complaint_date: '2026-10-05', customer_id: 'C1', part_serial_number: 'P2', defect_problem: '  burr ', severity: 'Critical', status: 'Under Investigation' },
  { complaint_no: 'CMP-3', complaint_date: '2026-10-09', customer_id: 'C2', part_serial_number: 'P1', defect_problem: 'BURR', severity: 'Minor', status: 'Closed' },
  { complaint_no: 'CMP-4', complaint_date: '2026-10-12', customer_id: 'C2', part_serial_number: 'P1', defect_problem: 'Surface  Finish', severity: 'Major', status: 'Resolved' },
  { complaint_no: 'CMP-5', complaint_date: '2026-10-15', customer_id: 'C3', part_serial_number: 'P3', defect_problem: null, severity: null, status: 'Action Pending' },
]

describe('normalizeDefect', () => {
  it('merges case and spacing variants', () => {
    expect(normalizeDefect('Burr')).toBe('burr')
    expect(normalizeDefect('  burr ')).toBe('burr')
    expect(normalizeDefect('BURR')).toBe('burr')
    expect(normalizeDefect('Surface   Finish')).toBe(normalizeDefect('surface finish'))
  })
  it('blank is null', () => {
    expect(normalizeDefect('')).toBeNull()
    expect(normalizeDefect('   ')).toBeNull()
    expect(normalizeDefect(null)).toBeNull()
  })
  it('labels use the most common tidy spelling (a tie goes to the first seen)', () => {
    expect(defectLabels([{ defect_problem: 'burr' }, { defect_problem: 'Burr' }, { defect_problem: ' Burr ' }])).toEqual({ burr: 'Burr' })
    expect(defectLabels([{ defect_problem: 'BURR' }, { defect_problem: 'burr' }])).toEqual({ burr: 'BURR' })
  })
})

describe('complaintKpis', () => {
  it('Closed = status Closed only; Open = all other statuses; total = open + closed', () => {
    const k = complaintKpis(ROWS)
    expect(k).toEqual({ total: 5, open: 4, closed: 1 })
    expect(k.open + k.closed).toBe(k.total)
  })
  it('empty', () => {
    expect(complaintKpis([])).toEqual({ total: 0, open: 0, closed: 0 })
  })
})

describe('filterComplaints', () => {
  it('date range is inclusive', () => {
    expect(filterComplaints(ROWS, { from: '2026-10-05', to: '2026-10-12' }).map((r) => r.complaint_no)).toEqual(['CMP-2', 'CMP-3', 'CMP-4'])
  })
  it('customer and severity combine with the dates', () => {
    expect(filterComplaints(ROWS, { from: '2026-10-01', to: '2026-10-31', customer: 'C2' }).map((r) => r.complaint_no)).toEqual(['CMP-3', 'CMP-4'])
    expect(filterComplaints(ROWS, { customer: 'C2', severity: 'Major' }).map((r) => r.complaint_no)).toEqual(['CMP-4'])
  })
})

describe('complaint charts', () => {
  it('by customer, largest first, with display names', () => {
    const names = { C1: 'Acme', C2: 'Brahma', C3: 'Diesel' }
    expect(complaintsByCustomer(ROWS, (id) => names[id])).toEqual([
      { label: 'Acme', value: 2 },
      { label: 'Brahma', value: 2 },
      { label: 'Diesel', value: 1 },
    ])
  })
  it('by defect merges variants and shows blanks as Not set', () => {
    expect(complaintsByDefect(ROWS)).toEqual([
      { label: 'Burr', value: 3 },
      { label: 'Not set', value: 1 },
      { label: 'Surface Finish', value: 1 },
    ])
  })
  it('by part', () => {
    expect(complaintsByPart(ROWS)).toEqual([
      { label: 'P1', value: 3 },
      { label: 'P2', value: 1 },
      { label: 'P3', value: 1 },
    ])
  })
  it('by severity in Critical / Major / Minor order, Not set last only when present', () => {
    expect(complaintsBySeverity(ROWS)).toEqual([
      { label: 'Critical', value: 1 },
      { label: 'Major', value: 2 },
      { label: 'Minor', value: 1 },
      { label: 'Not set', value: 1 },
    ])
    expect(complaintsBySeverity(ROWS.slice(0, 2))).toEqual([
      { label: 'Critical', value: 1 },
      { label: 'Major', value: 1 },
      { label: 'Minor', value: 0 },
    ])
  })
})
