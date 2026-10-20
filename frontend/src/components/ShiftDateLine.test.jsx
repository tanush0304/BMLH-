import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import ShiftDateLine from './ShiftDateLine'

const shifts = [{ shift_code: 'SHIFT-A', shift_name: 'Shift A', start_time: '8:30', end_time: '8:30 PM' }]
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

describe('ShiftDateLine', () => {
  it('renders the date + shift line, nothing without a date', () => {
    expect(renderToStaticMarkup(createElement(ShiftDateLine, { date: '2026-10-20', shiftCode: 'SHIFT-A', shifts }))).toContain('Date: 2026-10-20 · Shift A (8:30 AM – 8:30 PM)')
    expect(renderToStaticMarkup(createElement(ShiftDateLine, { date: '', shiftCode: 'SHIFT-A', shifts }))).toBe('')
  })
})

describe('field audit display additions are wired into the screens', () => {
  it('Data Entry + Manual Operations show the grid date (entryDate, also when correcting) + shift', () => {
    for (const p of ['modules/production/ProductionDataEntryScreen.jsx', 'modules/production/ManualOperationsScreen.jsx']) {
      expect(src(p)).toContain('<ShiftDateLine date={entryDate} shiftCode={shiftCode} shifts={shifts} />')
    }
  })
  it('WIP Receipt / Issue show and save the same transaction date', () => {
    for (const p of ['modules/stores/WipReceiptScreen.jsx', 'modules/stores/WipIssueScreen.jsx']) {
      expect(src(p)).toContain('<ShiftDateLine date={todayISO()} shiftCode={form.shift_code} shifts={shifts} />')
      expect(src(p)).toContain('transaction_date: todayISO()')
    }
  })
  it('RM Receipt: read-only RM Master fields on the form, list and export', () => {
    const s = src('modules/stores/RawMaterialStoreScreen.jsx')
    for (const k of ['rm_description', 'rm_type', 'rm_category', 'rm_source']) expect(s).toContain(`{ key: '${k}'`)
    for (const l of ['Description', 'Raw Material Type', 'Category', 'Unit of Measurement', 'RM Source']) expect(s).toContain(`<Field label="${l}">`)
    expect(s).toContain('...rmDetails(')
  })
  it('FG Despatch: Type of Order on the form, list and export', () => {
    const s = src('modules/stores/FinishedGoodsStoreScreen.jsx')
    expect(s).toContain("{ key: 'order_type', label: 'Type of Order' }")
    expect(s).toContain('<Field label="Type of Order">')
    expect(s).toContain('order_type: orderTypeForPrd(orders, t.prd_no)')
  })
})
