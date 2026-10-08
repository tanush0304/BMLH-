import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SearchableSelect from './SearchableSelect'

const OPTIONS = [
  { value: 'C-001', label: 'Yuken India Limited (C-001)' },
  { value: 'C-002', label: 'Aman Enterprises (C-002)' },
]

const render = (props) => renderToStaticMarkup(createElement(SearchableSelect, { options: OPTIONS, onChange: () => {}, ...props }))

describe('SearchableSelect markup', () => {
  it('shows the selected option label and a clear button, in the yellow dropdown style', () => {
    const html = render({ value: 'C-002' })
    expect(html).toContain('value="Aman Enterprises (C-002)"')
    expect(html).toContain('aria-label="Clear selection"')
    expect(html).toContain('input-dropdown')
    expect(html).toContain('role="combobox"')
  })

  it('matches numeric values against string option values (native select contract)', () => {
    const html = renderToStaticMarkup(
      createElement(SearchableSelect, { options: [{ value: 7, label: 'Seq 1 - Cutting' }], value: 7, onChange: () => {} })
    )
    expect(html).toContain('value="Seq 1 - Cutting"')
  })

  it('shows the placeholder and no clear button when empty', () => {
    const html = render({ value: '' })
    expect(html).toContain('placeholder="Select..."')
    expect(html).not.toContain('Clear selection')
  })

  it('disabled: input disabled and no clear button', () => {
    const html = render({ value: 'C-001', disabled: true })
    expect(html).toMatch(/<input[^>]*disabled=""/)
    expect(html).not.toContain('Clear selection')
  })

  it('starts closed (no listbox rendered)', () => {
    expect(render({ value: '' })).not.toContain('role="listbox"')
  })
})
