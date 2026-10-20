import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))

const { default: JobOrderDispatchScreen } = await import('./JobOrderDispatchScreen')
const { default: JobOrderReceiptScreen } = await import('./JobOrderReceiptScreen')

const hasButton = (html, label) => new RegExp(`>\s*${label}\s*</button>`).test(html)

describe.each([
  ['Dispatch', JobOrderDispatchScreen],
  ['Receipt', JobOrderReceiptScreen],
])('Jobwork %s Edit (033)', (_name, Screen) => {
  it('operator sees no Edit (and nobody sees Delete)', () => {
    const html = renderToStaticMarkup(createElement(Screen, { role: 'operator' }))
    expect(hasButton(html, 'Edit')).toBe(false)
    expect(hasButton(html, 'Delete')).toBe(false)
  })

  it.each(['supervisor', 'admin'])('%s sees Edit, disabled until a row is picked', (role) => {
    const html = renderToStaticMarkup(createElement(Screen, { role }))
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?Edit<\/button>/)
    expect(hasButton(html, 'Delete')).toBe(false)
  })
})
