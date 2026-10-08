import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ActionToolbar from './ActionToolbar'
import FormSection, { TextInput, SelectInput, AutoFillBox } from './FormSection'
import RecordsList, { sortRows } from './RecordsList'
import PageHeader, { PageHeaderBandProvider } from './PageHeader'

const render = (el) => renderToStaticMarkup(el)

describe('ActionToolbar', () => {
  it('renders New/Save/Edit/Delete/Clear and an enabled Print menu when export is on', () => {
    const html = render(createElement(ActionToolbar, {}))
    ;['New', 'Save', 'Edit', 'Delete', 'Clear', 'Print'].forEach((label) => expect(html).toContain(label))
    expect(html).not.toMatch(/aria-haspopup="menu"[^>]*disabled/)
  })

  it('has no search box -- searching lives in the records list', () => {
    const html = render(createElement(ActionToolbar, {}))
    expect(html).not.toContain('<input')
    expect(html).not.toContain('Search')
  })

  it('shows Print disabled on screens that turn export off', () => {
    const html = render(createElement(ActionToolbar, { showExport: false }))
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="Print is not available on this screen yet"/)
  })

  it('stock-ledger mode hides Edit and Delete and keeps New/Save/Clear/Print', () => {
    const html = render(createElement(ActionToolbar, { showEditDelete: false, saveLabel: 'Receive Into WIP' }))
    ;['New', 'Receive Into WIP', 'Clear', 'Print'].forEach((label) => expect(html).toContain(label))
    expect(html).not.toContain('Edit')
    expect(html).not.toContain('Delete')
  })

  it('shows Saving... and disables Save while saving', () => {
    const html = render(createElement(ActionToolbar, { saving: true }))
    expect(html).toMatch(/disabled=""[^>]*>.*Saving\.\.\./)
  })

  it('keeps the existing canSave/canEdit/canDelete gating', () => {
    const html = render(createElement(ActionToolbar, { canSave: false, canEdit: false, canDelete: false }))
    expect(html.match(/disabled=""/g)).toHaveLength(3)
  })
})

describe('FormSection', () => {
  it('is only as tall as its content (no fill-height classes)', () => {
    const html = render(createElement(FormSection, { title: '1. Details' }, 'x'))
    expect(html).not.toMatch(/(h-full|flex-1|min-h-|h-screen)/)
  })

  it('moves the leading number into the badge', () => {
    const html = render(createElement(FormSection, { title: '2. Supplier Details' }, 'x'))
    expect(html).toMatch(/>2<\/span>/)
    expect(html).toContain('>Supplier Details</h2>')
  })
})

describe('RecordsList', () => {
  const columns = [
    { key: 'code', label: 'Code' },
    { key: 'qty', label: 'Qty' },
    { key: 'status', label: 'Status', type: 'status' },
  ]
  const rows = [
    { code: 'B', qty: 10, status: 'Active' },
    { code: 'a', qty: 9, status: 'Inactive' },
    { code: 'C', qty: 100, status: 'Active' },
  ]

  it('shows the record count, sortable headers and status pills', () => {
    const html = render(createElement(RecordsList, { columns, rows, onSearchChange: () => {} }))
    expect(html).toContain('3 records')
    expect(html.match(/aria-sort="none"/g)).toHaveLength(3)
    expect(html).toContain('rounded-full')
    expect(html).toContain('placeholder="Search in list..."')
  })

  it('sorts numbers numerically and text case-insensitively, both directions', () => {
    expect(sortRows(rows, columns, { key: 'qty', dir: 1 }).map((r) => r.qty)).toEqual([9, 10, 100])
    expect(sortRows(rows, columns, { key: 'qty', dir: -1 }).map((r) => r.qty)).toEqual([100, 10, 9])
    expect(sortRows(rows, columns, { key: 'code', dir: 1 }).map((r) => r.code)).toEqual(['a', 'B', 'C'])
    expect(sortRows(rows, columns, null)).toBe(rows)
  })
})

describe('PageHeader', () => {
  it('renders the band and breadcrumb with no banner card', () => {
    const html = render(
      createElement(
        PageHeaderBandProvider,
        { breadcrumb: [{ label: 'Stores' }, { label: 'WIP Issue' }] },
        createElement(PageHeader, { title: 'WIP Issue', subtitle: 'Issue WIP  |  Stage to Stage' })
      )
    )
    expect(html).toContain('aria-current="page">WIP Issue</span>')
    expect(html).not.toContain('bg-gradient-to-r')
  })
})

describe('Input colour coding', () => {
  const noop = () => {}
  it('typed fields are manual entry, also while locked in view mode', () => {
    expect(render(createElement(TextInput, { value: 'x', onChange: noop }))).toContain('input-manual')
    expect(render(createElement(TextInput, { value: 'x', onChange: noop, disabled: true }))).toContain('input-manual')
  })

  it('always-disabled values with no onChange, and readOnly fields, are auto-filled', () => {
    expect(render(createElement(TextInput, { value: 'x', disabled: true }))).toContain('input-auto')
    expect(render(createElement(TextInput, { value: 'x', readOnly: true, onChange: noop }))).toContain('input-auto')
    expect(render(createElement(AutoFillBox, { value: '5', unit: 'Nos' }))).toContain('input-auto')
  })

  it('an empty auto-filled box keeps its line height (non-breaking space or placeholder)', () => {
    expect(render(createElement(AutoFillBox, { value: '' }))).toContain(' ')
    expect(render(createElement(AutoFillBox, { value: null }))).toContain(' ')
    expect(render(createElement(AutoFillBox, { value: '', placeholder: '(auto-generated on save)' }))).toContain('(auto-generated on save)')
    expect(render(createElement(AutoFillBox, { value: 0 }))).toContain('>0<')
  })

  it('selects are dropdowns', () => {
    expect(render(createElement(SelectInput, { value: '', onChange: noop, options: ['A'] }))).toContain('input-dropdown')
  })

  it('shows the legend once per form -- on section 1 only', () => {
    const first = render(createElement(FormSection, { title: '1. Details', subtitle: 'Core' }, 'x'))
    const second = render(createElement(FormSection, { title: '2. More' }, 'x'))
    ;['Dropdown', 'Manual entry', 'Auto-filled'].forEach((t) => expect(first).toContain(t))
    expect(second).not.toContain('Manual entry')
  })
})
