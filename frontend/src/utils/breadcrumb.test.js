import { describe, it, expect, vi } from 'vitest'
import { headerBreadcrumb } from './breadcrumb'
import { NAV_ITEMS } from './constants'

const production = NAV_ITEMS.find((n) => n.key === 'production')
const screen = production.subItems[0]

describe('headerBreadcrumb', () => {
  it('on a sub-screen the module crumb links back to the landing', () => {
    const onTop = vi.fn()
    const crumbs = headerBreadcrumb('production', screen.key, onTop)
    expect(crumbs).toHaveLength(2)
    expect(crumbs[0].label).toBe(production.label)
    expect(crumbs[1]).toEqual({ label: screen.label })
    crumbs[0].onClick()
    expect(onTop).toHaveBeenCalledTimes(1)
  })

  it('on the landing there is one non-link crumb', () => {
    expect(headerBreadcrumb('production', null, vi.fn())).toEqual([{ label: production.label }])
  })

  it('an unknown sub key is treated as the landing', () => {
    expect(headerBreadcrumb('production', 'no-such-screen', vi.fn())).toEqual([{ label: production.label }])
  })

  it('without onTop the module crumb is plain text', () => {
    expect(headerBreadcrumb('production', screen.key)[0]).toEqual({ label: production.label })
  })

  it('unknown module -> no crumbs', () => {
    expect(headerBreadcrumb('nope', null)).toEqual([])
  })
})
