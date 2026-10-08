import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SelectWithAddNew, { mergeOptions, ADD_NEW_VALUE } from './SelectWithAddNew'

describe('mergeOptions', () => {
  it('keeps built-ins first and appends distinct saved values, sorted', () => {
    expect(mergeOptions(['Bar', 'Sheet'], ['Sheet', 'Tube', '', null, ' Tube ', 'Angle'])).toEqual(['Bar', 'Sheet', 'Angle', 'Tube'])
  })
})

describe('SelectWithAddNew', () => {
  it('renders the options plus a trailing "+ Add new…" entry', () => {
    const html = renderToStaticMarkup(createElement(SelectWithAddNew, { value: '', onChange: () => {}, options: ['Bar'] }))
    expect(html).toContain('>Bar<')
    expect(html).toContain(`value="${ADD_NEW_VALUE}"`)
    expect(html).toContain('+ Add new…')
  })

  it('keeps a saved value that is not in the list selectable', () => {
    const html = renderToStaticMarkup(createElement(SelectWithAddNew, { value: 'Tube', onChange: () => {}, options: ['Bar'] }))
    expect(html).toContain('>Tube<')
  })
})
