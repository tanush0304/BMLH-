import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NAV_ITEMS, STORES_LANDING_TILES, subItemLabel } from '../utils/constants'
import { landingTiles } from './moduleLandings'
import ProductionModule from './production/ProductionModule'
import CustomerOrderModule from './customerOrder/CustomerOrderModule'
import JobOrderModule from './jobOrder/JobOrderModule'
import MaintenanceModule from './maintenance/MaintenanceModule'
import StoresModule from './stores/StoresModule'
import ReportsModule from './ReportsModule'
import Dashboard from './Dashboard'
import ProductionScheduleScreen from './production/ProductionScheduleScreen'
import RawMaterialStoreScreen from './stores/RawMaterialStoreScreen'
import FinishedGoodsStoreScreen from './stores/FinishedGoodsStoreScreen'

const subLabels = (key) => NAV_ITEMS.find((n) => n.key === key).subItems.map((s) => s.label)

describe('module landing tiles', () => {
  it.each(['production', 'customer-order', 'job-order', 'maintenance'])(
    '%s shows every sub-screen, labelled from constants.js, in sidebar order',
    (key) => {
      const tiles = landingTiles(key)
      expect(tiles.map((t) => t.label)).toEqual(subLabels(key))
      expect(tiles.every((t) => Boolean(t.img) || Boolean(t.icon))).toBe(true)
      expect(tiles.every((t) => Boolean(t.bg))).toBe(true)
    }
  )

  it('uses deck pictures where they exist and icons otherwise', () => {
    const art = (key) => Object.fromEntries(landingTiles(key).map((t) => [t.key, t.img ? 'img' : 'icon']))
    expect(art('production')).toEqual({ 'machine-entry': 'img', 'manual-operations': 'icon', planning: 'img', 'route-card': 'icon' })
    expect(art('customer-order')).toEqual({ enquiry: 'img', order: 'img' })
    expect(Object.values(art('job-order'))).toEqual(['img', 'img'])
    expect(Object.values(art('maintenance'))).toEqual(['img', 'img'])
  })

  it('Stores has 7 tiles; RM and FG tiles open the combined screen on the right tab', () => {
    const tiles = landingTiles('stores')
    expect(tiles.map((t) => t.label)).toEqual(STORES_LANDING_TILES.map((t) => t.label))
    expect(tiles).toHaveLength(7)
    const route = Object.fromEntries(tiles.map((t) => [t.key, [t.subKey, t.mode ?? null]]))
    expect(route).toEqual({
      'rm-receipt': ['rm', 'receipt'],
      'rm-issue': ['rm', 'issue'],
      'wip-receipt': ['wip-receipt', null],
      'wip-issue': ['wip-issue', null],
      'fg-receipt': ['fg', 'production-receipt'],
      'fg-despatch': ['fg', 'dispatch'],
      'rm-requisition': ['rm-requisition', null],
    })
    expect(tiles.filter((t) => t.img)).toHaveLength(6)
  })

  it('Machine Entry is shown as "Production Data Entry"', () => {
    expect(subItemLabel('production', 'machine-entry')).toBe('Production Data Entry')
    expect(landingTiles('production')[0].label).toBe('Production Data Entry')
  })
})

describe('module components', () => {
  it.each([
    ['production', ProductionModule],
    ['customer-order', CustomerOrderModule],
    ['job-order', JobOrderModule],
    ['maintenance', MaintenanceModule],
    ['stores', StoresModule],
  ])('%s renders its landing grid when no screen is selected', (key, Module) => {
    const html = renderToStaticMarkup(createElement(Module, { activeTab: null, onSelect: vi.fn() }))
    expect(html.match(/aria-label="Open /g)).toHaveLength(landingTiles(key).length)
  })

  it('a landing tile click opens its screen (and tab) through onSelect', () => {
    const onSelect = vi.fn()
    const landing = StoresModule({ activeTab: null, onSelect })
    landingTiles('stores').forEach((tile) => landing.props.onSelect(tile))
    expect(onSelect.mock.calls[0]).toEqual(['rm', 'receipt'])
    expect(onSelect.mock.calls[2]).toEqual(['wip-receipt', undefined])
  })

  it('Stores passes the tile tab to the combined RM / FG screens', () => {
    const rm = StoresModule({ activeTab: 'rm', activeMode: 'receipt' })
    expect(rm.type).toBe(RawMaterialStoreScreen)
    expect(rm.props.initialMode).toBe('receipt')
    const fg = StoresModule({ activeTab: 'fg', activeMode: null })
    expect(fg.type).toBe(FinishedGoodsStoreScreen)
    expect(fg.props.initialMode).toBeUndefined() // screen keeps its own default tab
  })
})

describe('Reports & Dashboard', () => {
  it('opens the Dashboard by default and the moved reports by key', () => {
    expect(ReportsModule({ activeTab: null }).type).toBe(Dashboard)
    expect(ReportsModule({ activeTab: 'schedule' }).type).toBe(ProductionScheduleScreen)
    expect(subLabels('dashboard')).toEqual(['PO Summary', 'Production Schedule', 'Order Traceability'])
  })
})
