import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { todayISO, mondayOf, formatLocalISODate } from './dates'

describe('todayISO', () => {
  const originalTZ = process.env.TZ

  beforeEach(() => {
    // Simulate a browser running in India -- this is what actually
    // matters, since todayISO() runs client-side and must reflect the
    // viewer's own local calendar day, not the server/CI machine's.
    process.env.TZ = 'Asia/Kolkata'
  })

  afterEach(() => {
    vi.useRealTimers()
    process.env.TZ = originalTZ
  })

  it('returns the LOCAL (IST) calendar date at 00:30 IST, not the UTC date', () => {
    // 00:30 IST on 2026-03-10 is 19:00 UTC on 2026-03-09. The old
    // implementation (new Date().toISOString().slice(0, 10)) would wrongly
    // report 2026-03-09 -- the previous day -- for anyone in India between
    // midnight and ~5:30am local time.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-09T19:00:00Z'))
    expect(todayISO()).toBe('2026-03-10')
  })

  it('still matches the UTC date comfortably mid-afternoon IST', () => {
    // 15:00 IST on 2026-03-10 is 09:30 UTC the same day -- both
    // implementations would agree here; this just confirms the fix didn't
    // break the common case.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-10T09:30:00Z'))
    expect(todayISO()).toBe('2026-03-10')
  })

  it('pads single-digit month and day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T09:00:00Z')) // 14:30 IST, same day
    expect(todayISO()).toBe('2026-01-05')
  })
})

describe('mondayOf + formatLocalISODate (WeeklyPlanGrid week-start dates)', () => {
  const originalTZ = process.env.TZ

  beforeEach(() => {
    process.env.TZ = 'Asia/Kolkata'
  })

  afterEach(() => {
    vi.useRealTimers()
    process.env.TZ = originalTZ
  })

  it('computes the correct Monday for a week containing a known Wednesday, in IST', () => {
    // 2026-03-11 is a Wednesday (2026-03-09 Mon .. 2026-03-15 Sun).
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-11T08:30:00Z')) // 14:00 IST, same day both ways
    const monday = mondayOf(new Date())
    expect(formatLocalISODate(monday)).toBe('2026-03-09')
    expect(monday.getDay()).toBe(1) // 1 = Monday
  })

  it('the old toISOString() formatting would have reported the wrong day (Sunday, not Monday)', () => {
    // mondayOf() pins its result to LOCAL midnight Monday 2026-03-09. In
    // IST that moment is 2026-03-08T18:30:00Z -- toISOString() renders
    // that as "2026-03-08", one day early, for every single week, not
    // just a rare midnight edge case. This test documents the bug
    // formatLocalISODate fixes, not current (already-correct) behavior.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-11T08:30:00Z'))
    const monday = mondayOf(new Date())
    expect(formatLocalISODate(monday)).toBe('2026-03-09')
    expect(monday.toISOString().slice(0, 10)).toBe('2026-03-08')
  })
})
