import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NAV_ITEMS, STORES_LANDING_TILES, subItemLabel, isModuleRestricted } from '../utils/constants'
import { landingTiles } from './moduleLandings'
import ProductionModule from './production/ProductionModule'
import CustomerOrderModule from './customerOrder/CustomerOrderModule'
import JobOrderModule from './jobOrder/JobOrderModule'
import MaintenanceModule from './maintenance/MaintenanceModule'
import StoresModule from './stores/StoresModule'
import ReportsModule from './ReportsModule'
import ReportLanding from '../components/reports/ReportLanding'
import QualityModule from './quality/QualityModule'
import QualityInspectionScreen from './quality/QualityInspectionScreen'
import CustomerComplaintScreen from './quality/complaints/CustomerComplaintScreen'
import ProductionScheduleScreen from './production/ProductionScheduleScreen'
import RawMaterialStoreScreen from './stores/RawMaterialStoreScreen'
import FinishedGoodsStoreScreen from './stores/FinishedGoodsStoreScreen'
import ComplaintStatusScreen from './reports/ComplaintStatusScreen'
import { ChartTypeProvider } from '../components/reports/ChartTypeToggle'
import ReportErrorBoundary from '../components/reports/ReportErrorBoundary'

const subLabels = (key) => NAV_ITEMS.find((n) => n.key === key).subItems.map((s) => s.label)

describe('module landing tiles', () => {
  it.each(['production', 'customer-order', 'job-order', 'maintenance', 'quality'])(
    '%s shows every sub-screen (admin), labelled from constants.js, in sidebar order',
    (key) => {
      const tiles = landingTiles(key, 'admin')
      expect(tiles.map((t) => t.label)).toEqual(subLabels(key))
      expect(tiles.every((t) => Boolean(t.img) || Boolean(t.icon))).toBe(true)
      expect(tiles.every((t) => Boolean(t.bg))).toBe(true)
    }
  )

  it('uses deck pictures where they exist and icons otherwise', () => {
    const art = (key) => Object.fromEntries(landingTiles(key, 'supervisor').map((t) => [t.key, t.img ? 'img' : 'icon']))
    expect(art('production')).toEqual({ 'production-data-entry': 'img', 'manual-operations': 'img', planning: 'img', 'route-card': 'icon', 'shift-verification': 'img' })
    expect(landingTiles('production', 'supervisor').find((t) => t.key === 'shift-verification').img).toBeTruthy()
    expect(art('customer-order')).toEqual({ enquiry: 'img', order: 'img' })
    expect(Object.values(art('job-order'))).toEqual(['img', 'img'])
    expect(Object.values(art('maintenance'))).toEqual(['img', 'img'])
  })

  it('Stores has 6 tiles (Raw Material Requisition is sidebar only); RM and FG tiles open the combined screen on the right tab', () => {
    const tiles = landingTiles('stores')
    expect(tiles.map((t) => t.label)).toEqual(STORES_LANDING_TILES.map((t) => t.label))
    expect(tiles).toHaveLength(6)
    const route = Object.fromEntries(tiles.map((t) => [t.key, [t.subKey, t.mode ?? null]]))
    expect(route).toEqual({
      'rm-receipt': ['rm', 'receipt'],
      'rm-issue': ['rm', 'issue'],
      'wip-receipt': ['wip-receipt', null],
      'wip-issue': ['wip-issue', null],
      'fg-receipt': ['fg', 'production-receipt'],
      'fg-despatch': ['fg', 'dispatch'],
    })
    expect(tiles.filter((t) => t.img)).toHaveLength(6)
  })

  it('Shift Verification is a supervisor/admin-only Production tile', () => {
    const keys = (role) => landingTiles('production', role).map((t) => t.key)
    expect(keys('supervisor')).toContain('shift-verification')
    expect(keys('admin')).toContain('shift-verification')
    expect(keys('operator')).not.toContain('shift-verification')
    expect(subItemLabel('production', 'shift-verification')).toBe('Shift Verification')
  })

  it('Production Planning is supervisor/admin only (creates PRDs, 030)', () => {
    const keys = (role) => landingTiles('production', role).map((t) => t.key)
    expect(keys('supervisor')).toContain('planning')
    expect(keys('admin')).toContain('planning')
    expect(keys('operator')).toEqual(['production-data-entry', 'manual-operations', 'route-card'])
  })

  it('the production-data-entry screen is labelled "Production Data Entry"', () => {
    expect(subItemLabel('production', 'production-data-entry')).toBe('Production Data Entry')
    expect(landingTiles('production', 'supervisor').map((t) => t.label)).toEqual([
      'Production Planning',
      'Production Data Entry',
      'Manual Operations',
      'Production Route Card',
      'Shift Verification',
    ])
  })
})

describe('module components', () => {
  it.each([
    ['production', ProductionModule],
    ['customer-order', CustomerOrderModule],
    ['job-order', JobOrderModule],
    ['maintenance', MaintenanceModule],
    ['stores', StoresModule],
    ['quality', QualityModule],
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

describe('Quality', () => {
  it('has 2 deck-picture tiles: Quality Inspection + Customer Complaint', () => {
    const tiles = landingTiles('quality')
    expect(tiles.map((t) => t.label)).toEqual(['Quality Inspection', 'Customer Complaint'])
    expect(tiles.every((t) => Boolean(t.img))).toBe(true)
  })

  it('opens inspection, and Customer Complaint as one tabbed screen', () => {
    expect(QualityModule({ activeTab: 'inspection' }).type).toBe(QualityInspectionScreen)
    const cc = QualityModule({ activeTab: 'complaint', activeMode: null, role: 'operator' })
    expect(cc.type).toBe(CustomerComplaintScreen)
    expect(cc.props.initialMode).toBeUndefined() // screen opens on Registration
    expect(cc.props.role).toBe('operator')
  })

  it('Customer Complaint shows both tabs and starts on Registration', () => {
    const html = renderToStaticMarkup(createElement(CustomerComplaintScreen, { role: 'supervisor' }))
    expect(html).toContain('>Registration<')
    expect(html).toContain('>Investigation &amp; Closure<')
    expect(html).toContain('(auto-generated on save)')
  })
})

describe('Reports & Dashboard', () => {
  const REPORTS = ['Customer Order Status', 'Job Order Status', 'Production Status', 'Daily Machine Status', 'Machine Downtime', 'Quality Status', 'WIP Status', 'Raw Material Status', 'Finished Goods Status', 'Customer Complaint Status']

  it('opens a landing with the 9 deck report cards, then Customer Complaint', () => {
    const el = ReportsModule({ activeTab: null, role: 'operator' })
    expect(el.type).toBe(ReportLanding)
    expect(el.props.tiles.map((t) => t.label)).toEqual(REPORTS)
    expect(el.props.tiles.every((t) => t.img && t.bg && t.accent && t.description)).toBe(true)
    expect(el.props.tiles.map((t) => t.label).join(' ')).not.toMatch(/Downtine|despatch/i)
  })
  it('keeps the moved reports sidebar-only, after the report cards', () => {
    expect(subLabels('dashboard')).toEqual([...REPORTS, 'PO Summary', 'Production Schedule', 'Order Traceability'])
    const schedule = ReportsModule({ activeTab: 'schedule' })
    expect(schedule.type).toBe(ReportErrorBoundary)
    expect(schedule.props.children.type).toBe(ProductionScheduleScreen)
  })

  it('Customer Complaint report: picture card, chart page (Bar default), supervisor/admin only', () => {
    const tile = ReportsModule({ activeTab: null, role: 'supervisor' }).props.tiles.find((t) => t.key === 'complaint-status')
    expect(tile).toMatchObject({ subKey: 'complaint-status', label: 'Customer Complaint Status' })
    expect(tile.img && tile.bg && tile.accent && tile.description).toBeTruthy()

    const el = ReportsModule({ activeTab: 'complaint-status' })
    expect(el.type).toBe(ReportErrorBoundary)
    expect(el.props.children.type).toBe(ChartTypeProvider)
    expect(el.props.children.props.children.type).toBe(ComplaintStatusScreen)

    // The whole Reports module is role-gated (App's guard), so is this report.
    expect(isModuleRestricted('dashboard', 'operator')).toBe(true)
    expect(isModuleRestricted('dashboard', 'supervisor')).toBe(false)
    expect(isModuleRestricted('dashboard', 'admin')).toBe(false)
  })
})
