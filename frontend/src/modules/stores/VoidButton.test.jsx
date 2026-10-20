import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))

const { default: RawMaterialStoreScreen } = await import('./RawMaterialStoreScreen')
const { default: FinishedGoodsStoreScreen } = await import('./FinishedGoodsStoreScreen')
const { default: JobOrderDispatchScreen } = await import('../jobOrder/JobOrderDispatchScreen')
const { default: VoidEntryDialog } = await import('../../components/VoidEntryDialog')

const voidButton = (html) => html.match(/<button[^>]*>(?:(?!<\/button>).)*Void<\/button>/)?.[0] ?? null

const screens = [
  ['RM Receipt', RawMaterialStoreScreen, { initialMode: 'receipt' }],
  ['FG Dispatch', FinishedGoodsStoreScreen, { initialMode: 'dispatch' }],
  ['Jobwork Dispatch', JobOrderDispatchScreen, {}],
]

describe.each(screens)('%s Void button (034)', (_name, Screen, props) => {
  it('operator sees no Void', () => {
    expect(voidButton(renderToStaticMarkup(createElement(Screen, { ...props, role: 'operator' })))).toBeNull()
  })

  it.each(['supervisor', 'admin'])('%s sees Void, disabled until a row is picked', (role) => {
    const button = voidButton(renderToStaticMarkup(createElement(Screen, { ...props, role })))
    expect(button).not.toBeNull()
    expect(button).toMatch(/disabled=""/)
  })
})

describe('Void not offered where it does not apply', () => {
  it('RM Issue and FG Production Receipt have no Void', () => {
    expect(voidButton(renderToStaticMarkup(createElement(RawMaterialStoreScreen, { initialMode: 'issue', role: 'admin' })))).toBeNull()
    expect(voidButton(renderToStaticMarkup(createElement(FinishedGoodsStoreScreen, { initialMode: 'production-receipt', role: 'admin' })))).toBeNull()
  })
})

describe('Void dialog', () => {
  it('asks for a reason and warns it cannot be undone', () => {
    const html = renderToStaticMarkup(createElement(VoidEntryDialog, { docNo: 'GRN-004', onConfirm: () => null, onCancel: () => {} }))
    expect(html).toContain('Void GRN-004')
    expect(html).toContain('This cannot be undone.')
    expect(html).toMatch(/Reason/)
  })
})
