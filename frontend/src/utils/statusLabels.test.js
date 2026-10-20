import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { displayStatus, statusSearchText, exportCellValue } from './statusLabels'
import { buildCsv } from './exportUtils'
import { dcTableStatusLabel, dcStatusCellText } from './reportOrders'
import { dcEditBlockReason, receiptEditBlockReason } from './jobwork'
import StatusPill from '../components/StatusPill'
import { STATUS_COLORS } from './constants'

const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

describe('shared status label (Closed Short -> Partially Received (Closed))', () => {
  it('maps only Closed Short; other statuses unchanged', () => {
    expect(displayStatus('Closed Short')).toBe('Partially Received (Closed)')
    for (const s of ['Sent', 'Partially Received', 'Received', 'Not Sent', 'Pending', 'Approved']) expect(displayStatus(s)).toBe(s)
    expect(displayStatus(null)).toBeNull()
  })

  it('the dashboard table helpers are the same label', () => {
    expect(dcTableStatusLabel('Closed Short')).toBe('Partially Received (Closed)')
    expect(dcStatusCellText('Closed Short', false)).toBe('Partially Received (Closed)')
  })

  it('search matches the stored value and the label ("closed", "short", "partial")', () => {
    for (const q of ['closed', 'short', 'partial', 'partially received (closed)']) expect(statusSearchText('Closed Short')).toContain(q)
    expect(statusSearchText('Sent')).not.toContain('closed')
    expect(statusSearchText(undefined)).toBe('')
  })

  it('Excel / PDF: status columns export the label, other columns the raw value', () => {
    const cols = [{ key: 'dc_no', label: 'DC No' }, { key: 'status', label: 'Status', type: 'status' }, { key: 'note', label: 'Note' }]
    const row = { dc_no: 'DC-010', status: 'Closed Short', note: 'Closed Short' }
    expect(exportCellValue(cols[1], row)).toBe('Partially Received (Closed)')
    expect(exportCellValue(cols[2], row)).toBe('Closed Short')
    expect(buildCsv(cols, [row]).split('\n')[1]).toBe('"DC-010","Partially Received (Closed)","Closed Short"')
  })

  it('StatusPill shows the label, keeps the slate colour of the stored value', () => {
    const html = renderToStaticMarkup(createElement(StatusPill, { status: 'Closed Short' }))
    expect(html).toContain('Partially Received (Closed)')
    expect(html).not.toContain('>Closed Short<')
    expect(STATUS_COLORS['Closed Short']).toMatch(/slate/)
    expect(html).toContain(STATUS_COLORS['Closed Short'])
  })

  it('edit-block reasons use the label', () => {
    expect(dcEditBlockReason({ dc_no: 'DC-010', is_open: false, closed_short_at: 'x' })).toBe('DC-010 is Partially Received (Closed) -- a closed DC can no longer be edited.')
    expect(receiptEditBlockReason({ receipt_no: 'JR-001', dc_no: 'DC-001' }, { is_open: false, closed_short_at: 'x', status: 'Closed Short' }))
      .toBe('JR-001 is on a closed DC (Partially Received (Closed)) -- it can no longer be edited.')
  })
})

describe('each screen uses the shared label', () => {
  it('Jobwork Dispatch / Receipt lists: StatusPill columns + status search', () => {
    for (const path of ['modules/jobOrder/JobOrderDispatchScreen.jsx', 'modules/jobOrder/JobOrderReceiptScreen.jsx']) {
      const s = src(path)
      expect(s).toMatch(/type: 'status'/)
      expect(s).toMatch(/statusSearchText\(/)
    }
  })

  it('Job Order dashboard: donut legend and table use the label', () => {
    const s = src('modules/reports/JobOrderStatusScreen.jsx')
    expect(s).toMatch(/label: dcTableStatusLabel\('Closed Short'\)/)
    expect(s).toMatch(/dcStatusCellText\(/)
  })

  it('Order Traceability DC list and Job Route Card render status through StatusPill', () => {
    expect(src('modules/production/OrderTraceabilityScreen.jsx')).toMatch(/key: 'status', label: 'Status', type: 'status'/)
    expect(src('components/JobRouteCardSheet.jsx')).toMatch(/<StatusPill status=\{r\.status\} \/>/)
  })

  it('"Close Short" action button text unchanged', () => {
    expect(src('modules/jobOrder/JobOrderReceiptScreen.jsx')).toContain("'Close Short'")
  })
})
