import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NAV_ITEMS } from '../../utils/constants'
import MasterList, { MASTER_ENTRIES, MasterCard } from './MasterList'

const EXPECTED_LABELS = [
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

describe('Masters landing entries', () => {
  it('keeps the established order and maps every card to a screen and icon', () => {
    expect(MASTER_ENTRIES.map((entry) => entry.label)).toEqual(EXPECTED_LABELS)
    expect(MASTER_ENTRIES.map((entry) => entry.key)).toEqual(
      NAV_ITEMS.find((item) => item.key === 'masters').subItems.map((item) => item.key)
    )
    expect(MASTER_ENTRIES).toHaveLength(16)
    expect(MASTER_ENTRIES.every((entry) => typeof entry.component === 'function')).toBe(true)
    expect(MASTER_ENTRIES.every((entry) => Boolean(entry.icon))).toBe(true)
  })

  it('shows all 16 cards when Masters has no selected submenu', () => {
    const html = renderToStaticMarkup(createElement(MasterList, { activeTab: null, onSelect: vi.fn() }))
    expect(html).toContain('Select a master module to view or manage its records.')
    expect(html.match(/aria-label="Open /g)).toHaveLength(16)
  })

  it('resolves each submenu key to its registered screen', () => {
    MASTER_ENTRIES.forEach((item) => {
      expect(MasterList({ activeTab: item.key }).type).toBe(item.component)
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