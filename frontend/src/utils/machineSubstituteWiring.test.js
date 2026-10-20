import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { stageMachineDisplay, openLogsWithSeq } from './machineEligibility'
import { buildJobRouteCardRows, jobRouteCardPrintHtml, routeCardCell } from './jobRouteCard'
import { buildShiftRows } from './shiftVerification'

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const machines = [{ machine_id: 'MC-004', machine_name: 'CNC 1' }, { machine_id: 'MC-005', machine_name: 'CNC 2' }]

describe('stageMachineDisplay (Order Traceability Machine column)', () => {
  it('planned only, or actual + (planned) when a log ran elsewhere', () => {
    expect(stageMachineDisplay({ plannedId: 'MC-004', logs: [] })).toBe('MC-004')
    expect(stageMachineDisplay({ plannedId: 'MC-004', logs: [{ machine_id: 'MC-004' }] })).toBe('MC-004')
    expect(stageMachineDisplay({ plannedId: 'MC-004', logs: [{ machine_id: 'MC-005' }] })).toBe('MC-005 (planned MC-004)')
    expect(stageMachineDisplay({ plannedId: 'MC-004', logs: [{ machine_id: 'MC-005' }, { machine_id: 'MC-004' }] })).toBe('MC-004, MC-005 (planned MC-004)')
  })
  it('open logs get their stage seq for busy labels', () => {
    expect(openLogsWithSeq([{ machine_id: 'MC-005', stage_id: 7, prd_no: 'PRD-006' }], [{ id: 7, seq: 50 }])).toEqual([{ machine_id: 'MC-005', stage_id: 7, prd_no: 'PRD-006', stage_seq: 50 }])
  })
})

describe('route card: actual vs planned on the status copy only', () => {
  const stages = [{ id: 1, seq: 20, operation: 'Rough Turning', type: 'Internal', machine_id: 'MC-004', cycle_time_min: 4, status: 'Completed' }]
  const rows = buildJobRouteCardRows({ card: { batch_qty: 200, shift_hours: 11 }, stages, jobWorkTypes: [], dispatches: [], machines, logs: [{ stage_id: 1, machine_id: 'MC-005' }] })
  it('status copy: "CNC 2 (planned MC-004)"; blank copy keeps the planned machine', () => {
    expect(routeCardCell(rows[0], 'machine', false)).toBe('CNC 2 (planned MC-004)')
    expect(routeCardCell(rows[0], 'machine', true)).toBe('CNC 1')
    expect(jobRouteCardPrintHtml({ header: { jc_no: 'JC-1' }, rows })).toContain('CNC 2 (planned MC-004)')
    expect(jobRouteCardPrintHtml({ header: { jc_no: 'JC-1' }, rows, blank: true })).not.toContain('planned MC-004')
  })
  it('no substitute: planned machine name on both copies', () => {
    const plain = buildJobRouteCardRows({ card: {}, stages, jobWorkTypes: [], dispatches: [], machines, logs: [{ stage_id: 1, machine_id: 'MC-004' }] })
    expect(routeCardCell(plain[0], 'machine', false)).toBe('CNC 1')
  })
})

describe('Shift Verification rows carry planned machine + reason', () => {
  it('from the log (040), falling back to the stage machine for older logs', () => {
    const base = { logDate: '2026-10-20', shiftCode: 'SHIFT-A', machines, employees: [], appUsers: [], orders: [], products: [], verifications: [] }
    const stages = [{ id: 1, seq: 20, operation: 'Rough Turning', machine_id: 'MC-004' }]
    const hours = [{ log_id: 9, log_date: '2026-10-20', shift_code: 'SHIFT-A', hour_slot: 1, qty_produced: 10, qty_rejected: 0, qty_rework: 0 }]
    const sub = buildShiftRows({ ...base, stages, hours, logs: [{ id: 9, prd_no: 'PRD-1', stage_id: 1, machine_id: 'MC-005', planned_machine_id: 'MC-004', substitute_reason: 'Breakdown' }] })
    const row = [...sub.machineRows, ...sub.manualRows].find((r) => r.log_id === 9)
    expect(row).toMatchObject({ machine_id: 'MC-005', planned_machine_id: 'MC-004', substitute_reason: 'Breakdown' })
    const old = buildShiftRows({ ...base, stages, hours, logs: [{ id: 9, prd_no: 'PRD-1', stage_id: 1, machine_id: 'MC-004' }] })
    expect([...old.machineRows, ...old.manualRows].find((r) => r.log_id === 9).planned_machine_id).toBe('MC-004')
  })
})

describe('screens are wired', () => {
  it('Data Entry: machinesForStage options, reason picker, reason saved (planned set by the DB), cycle-time note, banner', () => {
    const s = src('modules/production/ProductionDataEntryScreen.jsx')
    expect(s).toContain('machinesForStage({ mode: MACHINE_CHOICE_MODE')
    expect(s).toContain('data-testid="substitute-reason"')
    expect(s).toContain('substitute_reason: substituteNeeded ? substituteReason : null')
    expect(s).not.toMatch(/planned_machine_id:\s/)
    expect(s).toContain('setCycleNote(ct.note)')
    expect(s).toContain('machineLabel: actualMachineText(activeLog.machine_id)')
    expect(s).toContain('!!substituteError')
  })
  it('Quality Inspection: same machine rule + planned-machine parameter fallback', () => {
    const s = src('modules/quality/QualityInspectionScreen.jsx')
    expect(s).toContain('machinesForStage({ mode: MACHINE_CHOICE_MODE')
    expect(s).toContain('qualityParamsForMachine({')
    expect(s).toContain('data-testid="param-note"')
  })
  it('Shift Verification shows the substitute line; Order Traceability has a Machine column', () => {
    expect(src('modules/production/ShiftVerificationScreen.jsx')).toContain('data-testid="substitute-line"')
    expect(src('components/StageTraceTable.jsx')).toContain("{ key: 'machine', label: 'Machine' }")
  })
})
