import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Sidebar from './Sidebar'

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
      'Product Master',
      'Machine Master',
      'Job Work Master',
      'Cycle Time Master',
      'Customer Master',
      'Raw Material Master',
      'Supplier Master',
      'Shift Master',
      'Employee Master',
      'Vendor Master',
      'Quality Master',
      'Maintenance Master',
      'Production Batch Master',
      'Route Card',
      'Finished Goods Master',
      'WIP Master',
    ]
    masterScreens.forEach((label) => expect(html).toContain(label))
    expect(html.match(/aria-current="page"/g)).toHaveLength(2)
    expect(html).toContain('bg-white text-[#173A63]')
    expect(html).toContain('border-[#9BD86B] bg-white/15')
  })

  it('shows the selected submodule list for other modules too', () => {
    const html = renderSidebar('customer-order', 'enquiry')
    expect(html).toContain('Enquiries')
    expect(html).toContain('Orders')
    expect(html).toContain('PO Summary')
    expect(html).not.toContain('Product Master')
  })

  it('keeps the navigation scrollable when contextual content exceeds its height', () => {
    const html = renderSidebar('masters', 'customer')
    expect(html).toContain('overflow-y-auto')
  })
})