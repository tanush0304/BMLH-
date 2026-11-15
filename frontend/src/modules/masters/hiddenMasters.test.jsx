// @vitest-environment jsdom
// 2026-11-15: WIP Master + Finished Goods Master hidden from Masters (flag
// `hidden: true` in NAV_ITEMS). Code, queries and data kept; opening one lands
// on the Masters home. Stores FG / WIP screens and the FG Inventory report
// read the same views directly and are unaffected.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { NAV_ITEMS, canSeeSubItem, isHiddenSubItem } from '../../utils/constants'
import MasterList, { MASTER_ENTRIES } from './MasterList'
import * as storeMasters from '../../data/queries/storeMasters'

afterEach(() => cleanup())
const masters = NAV_ITEMS.find((n) => n.key === 'masters').subItems

describe('hidden masters', () => {
  it('WIP + FG carry the one flag; nothing else is hidden', () => {
    expect(masters.filter((s) => s.hidden).map((s) => s.key)).toEqual(['wip', 'finished-goods'])
    expect(isHiddenSubItem('masters', 'wip')).toBe(true)
    expect(isHiddenSubItem('masters', 'finished-goods')).toBe(true)
    expect(isHiddenSubItem('masters', 'product')).toBe(false)
  })

  it('no sidebar / card entry for any role', () => {
    for (const role of ['admin', 'supervisor', 'operator']) {
      expect(canSeeSubItem(masters.find((s) => s.key === 'wip'), role)).toBe(false)
    }
    expect(MASTER_ENTRIES.map((e) => e.key)).not.toContain('wip')
    expect(MASTER_ENTRIES.map((e) => e.key)).not.toContain('finished-goods')
    expect(MASTER_ENTRIES).toHaveLength(14)
  })

  it.each(['wip', 'finished-goods'])('opening %s shows the Masters home', (key) => {
    render(<MasterList activeTab={key} onSelect={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Masters' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open WIP Master' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open Finished Goods Master' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open Product Master' })).toBeTruthy()
  })

  it('queries kept for Stores FG / reports', () => {
    expect(typeof storeMasters.listFinishedGoodsMaster).toBe('function')
    expect(typeof storeMasters.listWipMaster).toBe('function')
  })
})
