import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { NAV_ITEMS, STORES_LANDING_TILES } from './constants'
import { validateDispatchQuantity } from './finishedGoodsValidation'
import { dispatchEditError } from './jobwork'

// Client rule (2026-10-20, Indian usage): users SEE "Despatch". DB values
// (transaction_type 'Dispatch'), table / column / function names and keys
// keep "dispatch". This guards the display text in the frontend sources.

const SRC = fileURLToPath(new URL('..', import.meta.url))
function sources(dir = SRC) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(jsx?)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

// Display contexts: label / title / name / subtitle props, saveLabel, JSX text,
// error strings starting with the word.
const DISPLAY_PATTERNS = [
  /\b(label|title|name|subtitle|saveLabel|description|exportTitle)=?\s*[:=]?\s*\{?[`'"][^`'"]*\bDispatch/,
  />[^<{]*\bDispatch(es|ed|ing)?\b[^<]*</,
  /[`'"]Dispatch (quantity|qty|Date|No|Details)/i,
]

describe('"Despatch" in everything users see', () => {
  it('no display string in src uses "Dispatch"', () => {
    const hits = []
    for (const file of sources()) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line)) return
        if (/transaction_type|=== 'Dispatch'|OUT = 'Dispatch'/.test(line)) return // DB value
        if (DISPLAY_PATTERNS.some((re) => re.test(line))) hits.push(`${file.replace(SRC, '')}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(hits).toEqual([])
  })

  it('sidebar / tiles / breadcrumbs read Despatch; keys unchanged', () => {
    const jobwork = NAV_ITEMS.find((n) => n.key === 'job-order').subItems.find((s) => s.key === 'dispatch')
    expect(jobwork.label).toBe('Despatch')
    const fgTile = STORES_LANDING_TILES.find((t) => t.key === 'fg-despatch')
    expect(fgTile).toMatchObject({ label: 'Finished Goods Despatch', mode: 'dispatch' })
  })

  it('frontend validation messages say Despatch', () => {
    expect(validateDispatchQuantity('0', 5, 5).error).toMatch(/^Despatch quantity/)
    expect(validateDispatchQuantity('9', 5, 10).error).toBe('Despatch quantity cannot exceed physical FG stock for this PRD.')
    expect(dispatchEditError({ qty: '5', dispatch_date: '', vendor_id: 'V1' }, { dc_no: 'DC-1', qty_received: 0, vendor_id: 'V1' }, { min: 0, max: 10 })).toBe('Despatch Date is required.')
  })
})
