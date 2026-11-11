// 046 shift-hours limit + good-vs-target efficiency + per-hour setup (JS side).
import { describe, it, expect } from 'vitest'
import { shiftGrossMinutes, shiftNetMinutes, slotMinutes, minutesOfRows, workedMinutesOfRows, fmtHrs, shiftHoursStatus, canAddSlot, withSettingTimeAsSetup } from './shiftHoursLimit'
import { computeLiveLogTotals, totalIdle, validateIdle, computeReportTotals, idleCategories } from './productionReport'
import { totals, availableMinutes, standardQty } from './reportAggregates'
import { correctionFieldsFor, correctionPatch, correctionError } from './shiftCorrection'

const SHIFT_A = { shift_code: 'SHIFT-A', start_time: '8:00 AM', end_time: '7:00 PM' } // 11 h gross
const HALF = { shift_code: 'H', start_time: '9:00 AM', end_time: '5:30 PM' } // 8.5 h
const NIGHT = { shift_code: 'N', start_time: '22:00', end_time: '06:00' } // 8 h, crosses midnight
const rows = (...slots) => slots.map((hour_slot) => ({ hour_slot }))

describe('gross shift + slot minutes (twin of SQL shift_gross_minutes / hour_slot_minutes)', () => {
  it('gross = end - start with the break inside; midnight wraps; unreadable -> null', () => {
    expect(shiftGrossMinutes(SHIFT_A)).toBe(660)
    expect(shiftGrossMinutes(HALF)).toBe(510)
    expect(shiftGrossMinutes(NIGHT)).toBe(480)
    expect(shiftGrossMinutes({ start_time: '8:00 AM', end_time: '8:00 AM' })).toBeNull()
    expect(shiftGrossMinutes({ start_time: '', end_time: '5 PM' })).toBeNull()
  })
  it('full slots 60, last slot its remainder, beyond the shift 60 (overtime), unknown shift 60', () => {
    expect([1, 8, 9, 10].map((s) => slotMinutes(HALF, s))).toEqual([60, 60, 30, 60])
    expect(slotMinutes(SHIFT_A, 11)).toBe(60)
    expect(slotMinutes(SHIFT_A, 12)).toBe(60)
    expect(slotMinutes(undefined, 3)).toBe(60)
    expect(minutesOfRows(rows(1, 2, 9), HALF)).toBe(150)
  })
  it('fmtHrs', () => {
    expect([660, 630, 30, 0, 20].map(fmtHrs)).toEqual(['11', '10.5', '0.5', '0', '0.33'])
  })
})

describe('shiftHoursStatus -- gross AND net limits', () => {
  // Shift A: 8:00 AM - 8:00 PM = 12 h gross, 60 min break -> 11 h net
  const A = { shift_code: 'SHIFT-A', start_time: '8:00 AM', end_time: '8:00 PM', lunch_break_duration: '60 min' }
  const lunchRow = (slot, lunch = 60) => ({ hour_slot: slot, lunch })

  it('net = gross - lunch_break_duration ("60 min", "1 hour", blank = 0); unreadable break -> null', () => {
    expect(shiftNetMinutes(A)).toBe(660)
    expect(shiftNetMinutes({ ...A, lunch_break_duration: '1 hour' })).toBe(660)
    expect(shiftNetMinutes({ ...A, lunch_break_duration: '' })).toBe(720)
    expect(shiftNetMinutes({ ...A, lunch_break_duration: 'lunch' })).toBeNull()
  })

  it('worked = slot minutes - Lunch column', () => {
    expect(workedMinutesOfRows([lunchRow(5), { hour_slot: 6 }], A)).toBe(60)
  })

  it('banner: "SHIFT-A: 11 net hrs, worked X, remaining Y"; this log + other logs on the machine', () => {
    const st = shiftHoursStatus({ shift: A, ownSavedRows: rows(1, 2, 3), otherRows: [...rows(4, 5), lunchRow(6, 30)], newRows: rows(7), machineLabel: 'MC-012', logDate: '2026-11-12' })
    expect(st).toMatchObject({ grossMin: 720, netMin: 660, workedMin: 330, remainingMin: 330, over: false })
    expect(st.banner).toBe('SHIFT-A: 11 net hrs, worked 5.5, remaining 5.5 · these rows add 1')
  })

  it('all 12 gross slots with the break hour as Lunch = 11 worked: allowed', () => {
    const twelve = [...rows(1, 2, 3, 4), lunchRow(5), ...rows(6, 7, 8, 9, 10, 11, 12)]
    const st = shiftHoursStatus({ shift: A, ownSavedRows: twelve.slice(0, 11), newRows: twelve.slice(11) })
    expect(st.over).toBe(false)
    expect(st.workedMin + st.addWorkedMin).toBe(660)
  })

  it('12 slots without any Lunch = 12 worked: over the NET limit', () => {
    const st = shiftHoursStatus({ shift: A, ownSavedRows: rows(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11), newRows: rows(12), machineLabel: 'MC-012', logDate: '2026-11-12' })
    expect(st.over).toBe(true)
    expect(st.error).toBe('SHIFT-A allows 11 net hrs on MC-012 for 12-11-2026 -- 11 worked (incl. other logs), 0 remaining; these rows add 1.')
  })

  it('past the gross end (13th slot) is over the GROSS limit even with lunch everywhere', () => {
    const allLunch = Array.from({ length: 12 }, (_, i) => lunchRow(i + 1, 30))
    const st = shiftHoursStatus({ shift: A, ownSavedRows: allLunch, newRows: [lunchRow(13, 30)], logDate: '2026-11-12' })
    expect(st.over).toBe(true)
    expect(st.error).toBe('SHIFT-A is 12 hrs (start to end) on this log for 12-11-2026 -- 12 of hour slots used, 0 left; these rows add 1.')
  })

  it('an edited saved row replaces its saved version (e.g. Lunch lowered)', () => {
    const saved = [...rows(1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12).map((r) => ({ ...r, id: r.hour_slot })), { id: 5, hour_slot: 5, lunch: 60 }]
    expect(shiftHoursStatus({ shift: A, ownSavedRows: saved }).over).toBe(false)
    expect(shiftHoursStatus({ shift: A, ownSavedRows: saved, editedRows: [{ id: 5, hour_slot: 5, lunch: 0 }] }).over).toBe(true)
  })

  it('supervisor / admin bypass both limits; banner shows overtime', () => {
    const st = shiftHoursStatus({ shift: A, ownSavedRows: rows(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12), newRows: rows(13), canOvertime: true })
    expect(st.over).toBe(false)
    expect(st.banner).toContain('overtime 2 hrs')
  })

  it('unreadable break -> gross limit only (banner without "net")', () => {
    const st = shiftHoursStatus({ shift: { ...A, lunch_break_duration: '??' }, ownSavedRows: rows(1, 2) })
    expect(st.netMin).toBeNull()
    expect(st.banner).toBe('SHIFT-A: 12 hrs, worked 2, remaining 10')
  })

  it('no readable shift times -> no limit (null)', () => {
    expect(shiftHoursStatus({ shift: { shift_code: 'X', start_time: '', end_time: '' } })).toBeNull()
  })

  it('canAddSlot: blocked by either limit', () => {
    const elevenWorked = shiftHoursStatus({ shift: A, ownSavedRows: rows(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11) })
    expect(canAddSlot(elevenWorked, A, 12)).toBe(false) // net full
    const roomy = shiftHoursStatus({ shift: A, ownSavedRows: rows(1, 2) })
    expect(canAddSlot(roomy, A, 3)).toBe(true)
    expect(canAddSlot(null, A, 13)).toBe(true)
  })
})

describe('Setting Time -> first hour rows Setup (once, no double count)', () => {
  const idle = (r) => totalIdle({ ...r, setup_min: null })
  it('copies into hour 1; spills to the next hour when > what hour 1 can take', () => {
    const out = withSettingTimeAsSetup([{ hour_slot: 2, lunch: 0 }, { hour_slot: 1, opr_issue: 10 }], { settingTimeMin: 70, logHasRowSetup: false, shift: SHIFT_A, otherIdle: idle })
    expect(out.find((r) => r.hour_slot === 1).setup_min).toBe(50)
    expect(out.find((r) => r.hour_slot === 2).setup_min).toBe(20)
  })
  it('not when the log already has row setup, a row has typed setup, or setting time is 0', () => {
    const r = [{ hour_slot: 1 }]
    expect(withSettingTimeAsSetup(r, { settingTimeMin: 15, logHasRowSetup: true, shift: SHIFT_A, otherIdle: idle })).toBe(r)
    expect(withSettingTimeAsSetup([{ hour_slot: 1, setup_min: 5 }], { settingTimeMin: 15, logHasRowSetup: false, shift: SHIFT_A, otherIdle: idle })[0].setup_min).toBe(5)
    expect(withSettingTimeAsSetup(r, { settingTimeMin: 0, logHasRowSetup: false, shift: SHIFT_A, otherIdle: idle })).toBe(r)
  })
})

describe('setup in idle rules', () => {
  it('totalIdle includes setup; null setup = 0; validateIdle counts it (<= 60 / slot length)', () => {
    expect(totalIdle({ opr_issue: 10, setup_min: 20 })).toBe(30)
    expect(totalIdle({ opr_issue: 10, setup_min: null })).toBe(10)
    expect(validateIdle({ setup_min: 40, lunch: 30 })).toMatch(/exceeds 60/)
    expect(validateIdle({ setup_min: 20 }, 30)).toBeNull()
    expect(validateIdle({ setup_min: 2.5 })).toMatch(/Setup must be a whole number/)
  })
  it('idleCategories: Setup first only with 046', () => {
    expect(idleCategories(false).map((c) => c.key)).not.toContain('setup_min')
    expect(idleCategories(true)[0].key).toBe('setup_min')
  })
  it('footer setting time: Σ row setup when any row has it, else the header (no double count)', () => {
    expect(computeReportTotals({ rows: [{ hour_slot: 1, setup_min: 15 }, { hour_slot: 2, setup_min: 5 }], settingTimeMin: 15 }).settingMin).toBe(20)
    expect(computeReportTotals({ rows: [{ hour_slot: 1 }], settingTimeMin: 15 }).settingMin).toBe(15)
  })
})

describe('live efficiency = good / target (046)', () => {
  const shifts = [SHIFT_A, HALF]
  it('target = (slot - setup - idle incl. lunch) / cycle time; good = produced - rejected - rework', () => {
    const t = computeLiveLogTotals({
      savedHours: [{ id: 1, hour_slot: 1, shift_code: 'SHIFT-A', qty_produced: 12, qty_rejected: 1, qty_rework: 1, setup_min: 10, lunch: 0 }],
      draftRows: [{ hour_slot: 2, qty_produced: 10, qty_rejected: 0, qty_rework: 0, lunch: 30 }],
      standardQtyPerHour: 12,
      goodVsTarget: { shifts, draftShiftCode: 'SHIFT-A', cycleTimeMin: 5 },
    })
    // net = (60-10) + (60-30) = 80 min -> target 16; good = 10 + 10 = 20 -> 125 %
    expect(t).toMatchObject({ total_good: 20, target_qty: 16, efficiency_pct: 125, no_cycle_time: false })
  })
  it('short last slot counts its real minutes', () => {
    const t = computeLiveLogTotals({ draftRows: [{ hour_slot: 9, qty_produced: 6 }], goodVsTarget: { shifts, draftShiftCode: 'H', cycleTimeMin: 5 } })
    expect(t.target_qty).toBe(6) // 30 min / 5
    expect(t.efficiency_pct).toBe(100)
  })
  it('no cycle time -> "No cycle time" flag, efficiency null; old logs fall back to 60 / std', () => {
    const none = computeLiveLogTotals({ draftRows: [{ hour_slot: 1, qty_produced: 6 }], goodVsTarget: { shifts, draftShiftCode: 'SHIFT-A', cycleTimeMin: null } })
    expect(none).toMatchObject({ efficiency_pct: null, target_qty: null, no_cycle_time: true })
    const old = computeLiveLogTotals({ draftRows: [{ hour_slot: 1, qty_produced: 6 }], standardQtyPerHour: 12, goodVsTarget: { shifts, draftShiftCode: 'SHIFT-A', cycleTimeMin: null } })
    expect(old.target_qty).toBe(12)
  })
  it('before 046 (no goodVsTarget): the old formula, unchanged', () => {
    const t = computeLiveLogTotals({ draftRows: [{ hour_slot: 1, qty_produced: 6 }], standardQtyPerHour: 12 })
    expect(t.efficiency_pct).toBe(50)
    expect(t).not.toHaveProperty('target_qty')
  })
})

describe('reports with 046 view columns', () => {
  it('efficiency = Σ good / Σ target; standard = Σ target; available = slot minutes - lunch', () => {
    const r046 = [
      { produced: 20, rejected: 2, rework: 0, good_qty: 18, target_qty: 20, slot_minutes: 120, lunch: 30, hour_rows: 2, standard_qty_per_hour: 12 },
      { produced: 10, rejected: 0, rework: 0, good_qty: 10, target_qty: 10, slot_minutes: 30, lunch: 0, hour_rows: 1, standard_qty_per_hour: 12 },
    ]
    expect(totals(r046)).toMatchObject({ good: 28, standard: 30, efficiency_pct: 93.3 })
    expect(standardQty(r046[0])).toBe(20)
    expect(availableMinutes(r046[0])).toBe(90)
    expect(availableMinutes({ hour_rows: 2, lunch: 30 })).toBe(90)
  })
  it('old rows (no target_qty) keep the old formula', () => {
    expect(totals([{ produced: 36, rejected: 3, rework: 0, hour_rows: 3, standard_qty_per_hour: 12 }]).efficiency_pct).toBe(100)
  })
})

describe('Shift Verification correction + Setup (046)', () => {
  const IDLE0 = { opr_issue: 0, program_issue: 0, tool_issue: 0, power_issue: 0, inspection: 0, breakdown: 0, mc_clean: 0, lunch: 0 }
  const h046 = { id: 1, hour_slot: 1, qty_produced: 10, qty_rejected: 0, qty_rework: 0, setup_min: null, ...IDLE0, remarks: null }
  it('setup_min is correctable only when the row carries it', () => {
    expect(correctionFieldsFor(h046)).toContain('setup_min')
    expect(correctionFieldsFor({ id: 2, qty_produced: 1 })).not.toContain('setup_min')
  })
  it('patch: blank setup stays null, a typed value is sent', () => {
    expect(correctionPatch(h046, { setup_min: '' })).toEqual({})
    expect(correctionPatch(h046, { setup_min: '15' })).toEqual({ setup_min: 15 })
  })
  it('idle + setup over 60 is refused', () => {
    expect(correctionError([h046], { 1: { setup_min: 40, lunch: 30 } })).toMatch(/idle minutes add up to 70/)
  })
})
