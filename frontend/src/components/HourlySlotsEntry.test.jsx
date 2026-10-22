import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import HourlySlotsEntry from './HourlySlotsEntry'
import { IDLE_CATEGORIES } from '../utils/productionReport'

function render() {
  return renderToStaticMarkup(
    createElement(HourlySlotsEntry, {
      startTime: '08:00',
      endTime: '10:00',
      shiftCode: 'SHIFT-A',
      logHours: [],
      employees: [],
      onSaveHours: () => {},
      onAddExtraHour: () => {},
      saving: false,
      resetKey: 'k',
      entryDate: '2026-10-22',
      showIdle: true,
    })
  )
}

describe('HourlySlotsEntry accessibility', () => {
  it('labels every hour input with its hour number', () => {
    const html = render()
    for (const n of [1, 2]) {
      expect(html).toContain(`aria-label="Hour ${n} produced"`)
      expect(html).toContain(`aria-label="Hour ${n} rejected"`)
      expect(html).toContain(`aria-label="Hour ${n} rework"`)
      expect(html).toContain(`aria-label="Hour ${n} remarks"`)
      for (const c of IDLE_CATEGORIES) {
        expect(html).toContain(`aria-label="Hour ${n} ${c.label}"`)
      }
    }
    expect(html).not.toContain(' slot ')
  })
})
