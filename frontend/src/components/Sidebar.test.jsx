import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Sidebar, { moduleClickAction } from './Sidebar'

function renderSidebar(activeKey, activeSubKey) {
  return renderToStaticMarkup(
    createElement(Sidebar, {
      activeKey,
      activeSubKey,
      onSelect: () => {},
      onSelectSub: () => {},
      onHome: () => {},
      userEmail: 'operator@example.com',
      onSignOut: () => {},
      role: 'supervisor',
    })
  )
}

describe('contextual sidebar navigation', () => {
  it('shows only the top-level modules on the Masters landing page', () => {
    const html = renderSidebar('masters', null)
    expect(html).toContain('Masters')
    expect(html).toContain('Reports &amp; Dashboard')
    expect(html).not.toContain('Product Master')
    expect(html).not.toContain('Masters screens')
  })

  it('shows all Master screens and distinguishes the active module and screen', () => {
    const html = renderSidebar('masters', 'customer')
    const masterScreens = [
      'Employee Master',
      'Shift Master',
      'Customer Master',
      'Supplier Master',
      'Vendor Master',
      'Job Work Master',
      'Machine Master',
      'Raw Material Master',
      'Product Master',
      'Cycle Time Master',
      'Production Batch Master',
      'Quality Master',
      'Maintenance Master',
      'Route Card',
      'WIP Master',
      'Finished Goods Master',
    ]
    masterScreens.forEach((label) => expect(html).toContain(label))
    // Rendered in data-entry order.
    const positions = masterScreens.map((label) => html.indexOf(`>${label}<`))
    expect(positions.every((pos) => pos >= 0)).toBe(true)
    expect([...positions].sort((x, y) => x - y)).toEqual(positions)
    expect(html.match(/aria-current="page"/g)).toHaveLength(2)
    expect(html).toContain('bg-white text-[#173A63]')
    expect(html).toContain('border-[#9BD86B] bg-white/15')
  })

  it('shows the selected submodule list for other modules too', () => {
    const html = renderSidebar('customer-order', 'enquiry')
    expect(html).toContain('New Enquiry')
    expect(html).toContain('New Order')
    expect(html).not.toContain('PO Summary') // moved to Reports & Dashboard
    expect(html).not.toContain('Product Master')
  })

  it('lists the moved reports under Reports & Dashboard', () => {
    const html = renderSidebar('dashboard', 'schedule')
    ;['PO Summary', 'Production Schedule', 'Order Traceability'].forEach((label) => expect(html).toContain(label))
  })

  it('keeps the Masters group collapsed on the landing page and auto-expands it inside a Master', () => {
    const landing = renderSidebar('masters', null)
    expect(landing).toContain('aria-expanded="false"')
    expect(landing).not.toContain('aria-expanded="true"')

    const inside = renderSidebar('masters', 'machine')
    expect(inside).toContain('aria-expanded="true"')
    expect(inside).toContain('Masters screens')
    // Other modules stay visible, but only the active module's group expands.
    expect(inside).toContain('Open Production')
    expect(inside).toContain('Open Stores')
    expect(inside).not.toContain('Production Data Entry')
    expect(inside.match(/aria-expanded="true"/g)).toHaveLength(1)
  })

  it('does not expand a role-locked module', () => {
    const html = renderToStaticMarkup(
      createElement(Sidebar, {
        activeKey: 'production',
        activeSubKey: 'production-data-entry',
        onSelect: () => {},
        onSelectSub: () => {},
        userEmail: 'op@example.com',
        onSignOut: () => {},
        role: 'operator',
      })
    )
    expect(html).toContain('Supervisor or admin access required')
    expect(html).not.toContain('Product Master')
    expect(html).toContain('Production Data Entry')
  })

  it('locks Masters, Customer Orders, Jobwork and Reports & Dashboard for an operator', () => {
    const html = renderToStaticMarkup(
      createElement(Sidebar, { activeKey: 'production', activeSubKey: null, onSelect: () => {}, onSelectSub: () => {}, onSignOut: () => {}, role: 'operator' })
    )
    expect(html).toContain('aria-label="Masters. Supervisor or admin access required."')
    expect(html).toContain('aria-label="Reports &amp; Dashboard. Supervisor or admin access required."')
    expect(html).toContain('aria-label="Customer Orders. Supervisor or admin access required."')
    expect(html).toContain('aria-label="Jobwork. Supervisor or admin access required."')
    expect(html).toContain('aria-label="Open Production"')
    expect(html).toContain('aria-label="Open Stores"')
    expect(html).toContain('aria-label="Open Quality"')
  })

  it('hides Production Planning and Shift Verification from an operator', () => {
    const html = renderToStaticMarkup(
      createElement(Sidebar, { activeKey: 'production', activeSubKey: 'production-data-entry', onSelect: () => {}, onSelectSub: () => {}, onSignOut: () => {}, role: 'operator' })
    )
    expect(html).toContain('Production Data Entry')
    expect(html).not.toContain('Production Planning')
    expect(html).not.toContain('Shift Verification')
  })

  it('keeps the navigation scrollable when contextual content exceeds its height', () => {
    const html = renderSidebar('masters', 'customer')
    expect(html).toContain('overflow-y-auto')
  })
})
describe('module button click', () => {
  const production = { key: 'production', subItems: [{ key: 'production-data-entry' }] }

  it('on a screen of the active module -> back to its landing', () => {
    expect(moduleClickAction(production, 'production', 'production-data-entry')).toBe('select')
  })

  it('on the active module landing -> expand / collapse', () => {
    expect(moduleClickAction(production, 'production', null)).toBe('toggle')
  })

  it('another module -> navigate there', () => {
    expect(moduleClickAction(production, 'stores', 'rm')).toBe('select')
    expect(moduleClickAction(production, 'stores', null)).toBe('select')
  })

  it('a module without screens -> navigate', () => {
    expect(moduleClickAction({ key: 'dashboard' }, 'dashboard', null)).toBe('select')
  })
})
