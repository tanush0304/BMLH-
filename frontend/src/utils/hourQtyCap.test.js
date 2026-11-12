import { describe, expect, it } from 'vitest'
import { capCycleTime, hourStandardQty, hourQtyCapProblems, normalizeHourCapSettings } from './hourQtyCap'
import { logSettingMinutes } from './productionReport'
import { prdProducedKpis } from './reportAggregates'

const SHIFT = { shift_code: 'A', start_time: '8:00 AM', end_time: '4:30 PM', lunch_break_duration: '30 min' } // 510 gross: slot 9 = 30 min
const shiftFor = () => SHIFT

describe('capCycleTime', () => {
  it('log cycle time, else 60 / std per hour, else null', () => {
    expect(capCycleTime({ cycleTimeMin: 0.95 })).toBe(0.95)
    expect(capCycleTime({ cycleTimeMin: null, standardQtyPerHour: 40 })).toBe(1.5)
    expect(capCycleTime({})).toBeNull()
  })
})

describe('hourStandardQty', () => {
  it('floor((slot - idle - setup) / cycle time); short last slot; never below 0', () => {
    expect(hourStandardQty({ hour_slot: 1, opr_issue: 10 }, { shift: SHIFT, cycleTime: 0.95 })).toEqual({ std: 52, netMin: 50 })
    expect(hourStandardQty({ hour_slot: 9 }, { shift: SHIFT, cycleTime: 1 })).toEqual({ std: 30, netMin: 30 })
    expect(hourStandardQty({ hour_slot: 1, setup_min: 50, lunch: 30 }, { shift: SHIFT, cycleTime: 1 })).toEqual({ std: 0, netMin: 0 })
    expect(hourStandardQty({ hour_slot: 1 }, { shift: SHIFT, cycleTime: 60 / 45 }).std).toBe(45) // float-safe floor
    expect(hourStandardQty({ hour_slot: 1 }, { shift: SHIFT, cycleTime: null })).toBeNull()
  })
})

describe('hourQtyCapProblems', () => {
  const base = { shiftFor, draftShiftCode: 'A', cycleTimeMin: 1 }
  const over = { newRows: [{ hour_slot: 1, qty_produced: 61 }] }
  it('new row over the hour standard (strict default) blocks', () => {
    expect(hourQtyCapProblems({ ...base, ...over })).toEqual({
      blocks: ['Hour 1: produced 61 is more than the standard 60 for this hour (60 min net ÷ 1 min cycle time).'],
      warnings: [],
    })
    expect(hourQtyCapProblems({ ...base, newRows: [{ hour_slot: 1, qty_produced: 60 }] })).toEqual({ blocks: [], warnings: [] })
  })
  it('no cycle time -> no hour cap', () => {
    expect(hourQtyCapProblems({ ...base, cycleTimeMin: null, newRows: [{ hour_slot: 1, qty_produced: 999 }] }).blocks).toEqual([])
  })
  it('edited row: checked with its saved values merged; a remarks-only edit is not checked', () => {
    const logHours = [{ id: 5, hour_slot: 2, shift_code: 'A', qty_produced: 70 }]
    expect(hourQtyCapProblems({ ...base, logHours, changes: [{ id: 5, remarks: 'x' }] }).blocks).toEqual([])
    expect(hourQtyCapProblems({ ...base, logHours, changes: [{ id: 5, opr_issue: 5 }] }).blocks[0]).toContain('Hour 2: produced 70 is more than the standard 55')
  })
  it('planned cap: saved + edited + new over planned; not when the total does not grow', () => {
    const logHours = [{ id: 5, hour_slot: 1, shift_code: 'A', qty_produced: 50 }]
    const nc = { ...base, cycleTimeMin: null, logHours }
    expect(hourQtyCapProblems({ ...nc, plannedQty: 100, newRows: [{ hour_slot: 2, qty_produced: 51 }] }).blocks).toEqual([
      "Produced 101 is more than this log's planned qty 100 (the material available at Start).",
    ])
    expect(hourQtyCapProblems({ ...nc, plannedQty: 100, newRows: [{ hour_slot: 2, qty_produced: 50 }] }).blocks).toEqual([])
    expect(hourQtyCapProblems({ ...nc, plannedQty: 40, changes: [{ id: 5, qty_produced: 45 }] }).blocks).toEqual([])
    expect(hourQtyCapProblems({ ...nc, plannedQty: null, newRows: [{ hour_slot: 2, qty_produced: 500 }] }).blocks).toEqual([])
  })
  it('supervisor_override: operator blocked; supervisor / admin warned', () => {
    const settings = { mode: 'supervisor_override', tolerancePct: '0' }
    expect(hourQtyCapProblems({ ...base, ...over, settings, role: 'operator' }).blocks).toHaveLength(1)
    for (const role of ['supervisor', 'admin']) {
      expect(hourQtyCapProblems({ ...base, ...over, settings, role })).toMatchObject({ blocks: [], warnings: [expect.stringContaining('Hour 1: produced 61')] })
    }
  })
  it('strict blocks a supervisor too; off -> no hourly cap but the planned cap still blocks', () => {
    expect(hourQtyCapProblems({ ...base, ...over, settings: { mode: 'strict' }, role: 'admin' }).blocks).toHaveLength(1)
    const off = hourQtyCapProblems({ ...base, newRows: [{ hour_slot: 1, qty_produced: 500 }], plannedQty: 100, settings: { mode: 'off' }, role: 'operator' })
    expect(off).toEqual({ blocks: ["Produced 500 is more than this log's planned qty 100 (the material available at Start)."], warnings: [] })
  })
  it('tolerance: standard = floor(net / ct x (1 + pct / 100)), shown in the message', () => {
    const settings = { mode: 'strict', tolerancePct: '10' }
    expect(hourQtyCapProblems({ ...base, newRows: [{ hour_slot: 1, qty_produced: 66 }], settings }).blocks).toEqual([])
    expect(hourQtyCapProblems({ ...base, newRows: [{ hour_slot: 1, qty_produced: 67 }], settings }).blocks).toEqual([
      'Hour 1: produced 67 is more than the standard 66 for this hour (60 min net ÷ 1 min cycle time + 10 %).',
    ])
  })
})

describe('normalizeHourCapSettings', () => {
  it('missing / invalid -> strict, 0 (as 051)', () => {
    expect(normalizeHourCapSettings()).toEqual({ mode: 'strict', tolerancePct: 0 })
    expect(normalizeHourCapSettings({ mode: 'xyz', tolerancePct: 'abc' })).toEqual({ mode: 'strict', tolerancePct: 0 })
    expect(normalizeHourCapSettings({ mode: 'off', tolerancePct: '150' })).toEqual({ mode: 'off', tolerancePct: 0 })
    expect(normalizeHourCapSettings({ mode: 'supervisor_override', tolerancePct: '7.5' })).toEqual({ mode: 'supervisor_override', tolerancePct: 7.5 })
    expect(normalizeHourCapSettings({ tolerancePct: '-5' }).tolerancePct).toBe(0)
  })
})

describe('logSettingMinutes', () => {
  it('Σ row setup when any row has it (drafts replace edited rows), else the Start setting time', () => {
    expect(logSettingMinutes({ savedHours: [{ id: 1, setup_min: 20 }, { id: 2, setup_min: null }], draftRows: [{ id: 2, setup_min: 5 }, { hour_slot: 3, setup_min: '' }], settingTimeMin: 99 })).toBe(25)
    expect(logSettingMinutes({ savedHours: [{ id: 1 }], draftRows: [], settingTimeMin: 30 })).toBe(30)
    expect(logSettingMinutes({ savedHours: [], draftRows: [], settingTimeMin: null })).toBe(0)
  })
})

describe('prdProducedKpis', () => {
  it('PRD qty, PO line qty, produced = last stage accepted', () => {
    const stages = [{ id: 1, seq: 10 }, { id: 3, seq: 30 }, { id: 2, seq: 20 }]
    expect(prdProducedKpis({ order: { prd_qty: 150, order_qty: 300 }, stages, aggregates: { 1: { accepted: 150 }, 3: { output: 140, accepted: 134 } } })).toMatchObject({ prd_qty: 150, order_qty: 300, produced: 134 })
    expect(prdProducedKpis({ order: null, stages: [], aggregates: {} })).toMatchObject({ prd_qty: null, produced: 0 })
  })
})
