import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NAV_ITEMS } from '../../utils/constants'
import MasterList, { MASTER_ENTRIES, MasterCard } from './MasterList'

const EXPECTED_LABELS = [
  'Employee Master',
  'Customer Master',
  'Product Master',
  'Supplier Master',
  'Raw Material Master',
  'Vendor Master',
  'Quality Master',
  'Machine Master',
  'Job Work Master',
  'Cycle Time Master',
  'Shift Master',
  'Production Batch Master',
  'Maintenance Master',
  'Finished Goods Master',
  'WIP Master',
  'Stores Master – Raw Material',
  'Route Card',
]

describe('Masters landing entries', () => {
  it('keeps the client tile order and maps every card to a screen, icon and description', () => {
    expect(MASTER_ENTRIES.map((entry) => entry.label)).toEqual(EXPECTED_LABELS)
    expect(MASTER_ENTRIES.map((entry) => entry.key)).toEqual(
      NAV_ITEMS.find((item) => item.key === 'masters').subItems.map((item) => item.key)
    )
    expect(MASTER_ENTRIES).toHaveLength(17)
    expect(MASTER_ENTRIES.every((entry) => typeof entry.component === 'function')).toBe(true)
    expect(MASTER_ENTRIES.every((entry) => Boolean(entry.icon))).toBe(true)
    expect(MASTER_ENTRIES.every((entry) => entry.description?.startsWith('Manage '))).toBe(true)
    expect(MASTER_ENTRIES.every((entry) => /^#[0-9A-F]{6}$/.test(entry.color) && /^#[0-9A-F]{6}$/.test(entry.bg))).toBe(true)
  })

  it('shows all 17 cards when Masters has no selected submenu', () => {
    const html = renderToStaticMarkup(createElement(MasterList, { activeTab: null, onSelect: vi.fn() }))
    expect(html).toContain('Select a master module to view or manage its records.')
    expect(html.match(/aria-label="Open /g)).toHaveLength(17)
    EXPECTED_LABELS.forEach((label) => expect(html).toContain('>' + label + '</span>'))
  })

  it('renders PPT-style cards: description text, no tile pictures', () => {
    const html = renderToStaticMarkup(createElement(MasterList, { activeTab: null, onSelect: vi.fn() }))
    expect(html).not.toMatch(/\.webp/)
    expect(html).toContain('Manage employee details, roles and skills')
    expect(html).toContain('Manage operation sequences and routing details')
  })

  it('resolves each submenu key to its registered screen', () => {
    MASTER_ENTRIES.forEach((item) => {
      expect(MasterList({ activeTab: item.key }).props.children.type).toBe(item.component)
    })
  })

  it('sends each card click to its corresponding submenu key', () => {
    const onSelect = vi.fn()
    MASTER_ENTRIES.forEach((item) => {
      const card = MasterCard({ item, onSelect })
      card.props.onClick()
    })
    expect(onSelect.mock.calls.map(([key]) => key)).toEqual(MASTER_ENTRIES.map((item) => item.key))
  })
})

describe('Masters header band', () => {
  it('renders the band with logos, title and breadcrumb on the landing page', () => {
    const html = renderToStaticMarkup(createElement(MasterList, { activeTab: null, onSelect: vi.fn() }))
    expect(html).toContain('alt="BMLH Engineering"')
    expect(html).toContain('alt="Pragati &amp; Unnati"')
    expect(html).toContain('Developed by')
    expect(html).toContain('aria-label="Breadcrumb"')
    expect(html).toContain('aria-current="page">Masters</span>')
    expect(html).not.toContain('ERP System')
  })

  it('links the breadcrumb back to the Masters landing from inside a master', () => {
    const onSelect = vi.fn()
    const el = MasterList({ activeTab: 'customer', onSelect })
    const [masters, current] = el.props.breadcrumb
    expect(current.label).toBe('Customer Master')
    masters.onClick()
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})
