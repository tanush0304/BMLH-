import { describe, it, expect } from 'vitest'
import { inWeek, weekCellState } from './maintenanceGrid'

describe('inWeek', () => {
  it('covers Monday through Sunday', () => {
    expect(inWeek('2026-10-05', '2026-10-05')).toBe(true)
    expect(inWeek('2026-10-11', '2026-10-05')).toBe(true)
    expect(inWeek('2026-10-12', '2026-10-05')).toBe(false)
    expect(inWeek('2026-10-10T08:00:00', '2026-10-05')).toBe(true)
    expect(inWeek(null, '2026-10-05')).toBe(false)
  })
})

describe('weekCellState', () => {
  const base = { machineId: 'M1' }
  it('an unplanned visit shows Completed (E2E: 2026-10-10 visit was grey)', () => {
    const s = weekCellState({ ...base, week: '2026-10-05', logs: [{ machine_id: 'M1', log_date: '2026-10-10' }] })
    expect(s.status).toBe('Completed')
  })
  it('Next Due shows as Due in its week (E2E: 2026-11-15 not shown)', () => {
    const schedules = [{ machine_id: 'M1', next_maintenance_due: '2026-11-15' }]
    expect(weekCellState({ ...base, week: '2026-11-09', schedules }).status).toBe('Due')
    expect(weekCellState({ ...base, week: '2026-11-09', schedules }).title).toMatch('Next due 2026-11-15')
    expect(weekCellState({ ...base, week: '2026-11-16', schedules }).status).toBeNull()
  })
  it('Planned keeps its plan id; Completed beats Planned and Due', () => {
    const planStatus = [{ machine_id: 'M1', planned_week_start_date: '2026-11-09', status: 'Planned', plan_id: 7 }]
    expect(weekCellState({ ...base, week: '2026-11-09', planStatus })).toMatchObject({ status: 'Planned', planId: 7 })
    const logs = [{ machine_id: 'M1', log_date: '2026-11-10' }]
    expect(weekCellState({ ...base, week: '2026-11-09', planStatus, logs }).status).toBe('Completed')
  })
  it('ignores other machines', () => {
    expect(weekCellState({ ...base, week: '2026-10-05', logs: [{ machine_id: 'M2', log_date: '2026-10-06' }] }).status).toBeNull()
  })
})
