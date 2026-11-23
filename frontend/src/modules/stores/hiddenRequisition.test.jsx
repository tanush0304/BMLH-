// Raw Material Requisition hidden for every role (2026-11-23): `hidden: true`
// on the Stores sub-item (same flag as the WIP / FG masters). No sidebar
// entry, no landing card; a jump to it lands on the Stores home. Screen,
// queries and table are kept.
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
import { NAV_ITEMS, canSeeSubItem, isHiddenSubItem } from '../../utils/constants'
import { landingTiles } from '../moduleLandings'
import Sidebar from '../../components/Sidebar'
import StoresModule from './StoresModule'
import ModuleLanding from '../../components/ModuleLanding'
import * as requisitionQueries from '../../data/queries/rawMaterialRequisitions'
import RawMaterialRequisitionScreen from './RawMaterialRequisitionScreen'

const stores = NAV_ITEMS.find((n) => n.key === 'stores').subItems

describe('Raw Material Requisition hidden', () => {
  it('flagged hidden; invisible to every role', () => {
    expect(isHiddenSubItem('stores', 'rm-requisition')).toBe(true)
    expect(isHiddenSubItem('stores', 'rm')).toBe(false)
    const req = stores.find((s) => s.key === 'rm-requisition')
    for (const role of ['operator', 'supervisor', 'admin', undefined]) expect(canSeeSubItem(req, role)).toBe(false)
  })

  it('Stores sidebar shows the 4 other screens only, for every role', () => {
    for (const role of ['operator', 'supervisor', 'admin']) {
      const html = renderToStaticMarkup(createElement(Sidebar, { activeKey: 'stores', activeSubKey: 'rm', role, onSelect: vi.fn(), onSelectSub: vi.fn() }))
      expect(html).not.toContain('Raw Material Requisition')
      for (const label of ['Raw Material Stores', 'Finished Goods Stores', 'WIP Receipt', 'WIP Issue']) expect(html).toContain(label)
    }
  })

  it('no Stores landing card for it (6 cards, none opens rm-requisition)', () => {
    for (const role of ['operator', 'supervisor', 'admin']) {
      const tiles = landingTiles('stores', role)
      expect(tiles).toHaveLength(6)
      expect(tiles.some((t) => t.subKey === 'rm-requisition' || /Requisition/.test(t.label))).toBe(false)
    }
  })

  it('a jump to it renders the Stores home, not the screen', () => {
    const el = StoresModule({ activeTab: 'rm-requisition', activeMode: null, role: 'admin', onSelect: vi.fn() })
    expect(el.type).toBe(ModuleLanding)
    expect(el.type).not.toBe(RawMaterialRequisitionScreen)
  })

  it('code and queries are kept', () => {
    expect(typeof RawMaterialRequisitionScreen).toBe('function')
    for (const fn of ['listRequisitions', 'createRequisition', 'generateNextRequisitionNo', 'updateRequisition']) {
      expect(typeof requisitionQueries[fn]).toBe('function')
    }
  })
})
