import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../data/queries/productionPlanning', () => ({ listProductionPlans: vi.fn(() => new Promise(() => {})) }))

const { default: ProductionRouteCardScreen } = await import('./ProductionRouteCardScreen')

describe('Production Route Card screen', () => {
  // Visible to operators (Production module), but view/print only for everyone:
  // route cards are created by Production Planning (supervisor/admin).
  it.each(['operator', 'supervisor'])('offers no New / Save / Edit / Delete for %s', (role) => {
    const html = renderToStaticMarkup(createElement(ProductionRouteCardScreen, { role }))
    expect(html).toContain('Job Route Cards')
    for (const action of ['New', 'Save', 'Edit', 'Delete']) expect(html).not.toMatch(new RegExp(`>\\s*${action}\\s*<`))
  })
})
