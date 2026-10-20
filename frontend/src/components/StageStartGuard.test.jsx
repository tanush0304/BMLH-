import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import StageStartGuard from './StageStartGuard'

const stage = { id: 3, seq: 30, operation: 'Finish Turning' }
const prev = { id: 2, seq: 20, operation: 'Rough Turning' }
const html = (p) => renderToStaticMarkup(createElement(StageStartGuard, { stage, machineLabel: 'CNC 2 (MC-005)', ...p }))
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

describe('StageStartGuard', () => {
  it('summary line always; nothing else when available and earlier stages done', () => {
    const h = html({ available: 40, earlierIncomplete: null })
    expect(h).toContain('Stage 30 – Finish Turning on CNC 2 (MC-005) · Available: 40')
    expect(h).not.toContain('Nothing available')
    expect(h).not.toContain('I confirm')
  })
  it('available 0: the block message, no confirm box', () => {
    const h = html({ available: 0, earlierIncomplete: prev })
    expect(h).toContain('Nothing available for Stage 30 yet — the previous stage has not produced accepted pieces.')
    expect(h).not.toContain('I confirm')
  })
  it('earlier stage incomplete: amber warning + "I confirm" box (in-app, no dialog)', () => {
    const h = html({ available: 40, earlierIncomplete: prev, confirmed: false })
    expect(h).toContain('Stage 20 – Rough Turning is not complete yet. Starting a later stage now is allowed only for partial batches.')
    expect(h).toContain('type="checkbox"')
    expect(h).toContain('I confirm')
  })
})

describe('wired into both screens', () => {
  for (const p of ['modules/production/ProductionDataEntryScreen.jsx', 'modules/production/ManualOperationsScreen.jsx']) {
    it(p, () => {
      const s = src(p)
      expect(s).toContain('<StageStartGuard')
      expect(s).toContain('data-testid="running-banner"')
      expect(s).toContain('canStartStage({ available: plannedQty, earlierIncomplete, confirmed: confirmEarlier })')
      expect(s).not.toMatch(/window\.confirm\([^)]*partial/)
    })
  }
  it('Data Entry pre-selects the next stage machine and labels it', () => {
    const s = src('modules/production/ProductionDataEntryScreen.jsx')
    expect(s).toContain("' (next stage)'")
    expect(s).toContain('pickDefaultStage(candidates, availability)')
    expect(s).toContain("selectPrd(log.prd_no, pending, { autoPick: false })")
  })
})
