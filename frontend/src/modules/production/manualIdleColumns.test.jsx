// @vitest-environment jsdom
// Manual Operations idle + Setup columns (2026-11-13): the hourly grid gets
// the same 8 idle columns (incl. Lunch) + Setup (046) as Data Entry. Same
// rules: idle + setup <= 60 per hour, lunch lowers net worked hours (per log,
// no machine), saved rows carry the idle fields + setup_min, and the hourly
// qty cap (051) deducts them.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import HourlySlotsEntry from '../../components/HourlySlotsEntry'
import { hourQtyCapProblems } from '../../utils/hourQtyCap'

const SHIFT = { shift_code: 'SHIFT-A', start_time: '08:00', end_time: '12:00', lunch_break_duration: '60 min' } // 4 gross, 3 net

// Exactly what ManualOperationsScreen passes (no machine, no other logs).
function setup(props = {}) {
  const onSaveHours = vi.fn(async () => {})
  render(
    <HourlySlotsEntry
      startTime={SHIFT.start_time}
      endTime={SHIFT.end_time}
      shiftCode="SHIFT-A"
      logHours={[]}
      employees={[]}
      onSaveHours={onSaveHours}
      onAddExtraHour={vi.fn(async () => {})}
      saving={false}
      resetKey="k"
      entryDate="2026-11-13"
      showIdle
      withSetup
      hoursLimit={{ shift: SHIFT, otherRows: [], canOvertime: false, machineLabel: '' }}
      {...props}
    />,
  )
  return { onSaveHours }
}
afterEach(() => cleanup())

describe('Manual Operations -- idle + Setup columns', () => {
  it('the screen turns the columns on (showIdle + withSetup={v046})', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/modules/production/ManualOperationsScreen.jsx'), 'utf8')
    const grid = src.slice(src.indexOf('<HourlySlotsEntry'), src.indexOf('/>', src.indexOf('<HourlySlotsEntry')))
    expect(grid).toMatch(/\n\s*showIdle\n/)
    expect(grid).toContain('withSetup={v046}')
  })

  it('shows Setup, the 8 idle columns incl. Lunch, and Remarks', () => {
    setup()
    for (const label of ['Setup', 'Lunch', 'remarks']) {
      expect(screen.getByLabelText(new RegExp(`^Hour 1 ${label}$`, 'i'))).toBeTruthy()
    }
  })

  it('idle + setup over 60 in an hour blocks Save', async () => {
    const { onSaveHours } = setup()
    fireEvent.change(screen.getByLabelText('Hour 1 produced'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Hour 1 Setup'), { target: { value: '40' } })
    fireEvent.change(screen.getByLabelText('Hour 1 Lunch'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Hours' }))
    await new Promise((r) => setTimeout(r, 20))
    expect(onSaveHours).not.toHaveBeenCalled()
  })

  it('saves idle fields + setup_min; Lunch lowers the net worked hours', async () => {
    const { onSaveHours } = setup()
    fireEvent.change(screen.getByLabelText('Hour 1 produced'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Hour 1 Setup'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText('Hour 1 Lunch'), { target: { value: '30' } })
    await waitFor(() => expect(screen.getByTestId('shift-hours-banner').textContent).toContain('these rows add 0.5'))
    fireEvent.click(screen.getByRole('button', { name: 'Save Hours' }))
    await waitFor(() => expect(onSaveHours).toHaveBeenCalledTimes(1))
    const [rows] = onSaveHours.mock.calls[0]
    expect(rows[0]).toMatchObject({ hour_slot: 1, qty_produced: 5, setup_min: 15, lunch: 30 })
  })

  it('hourly cap deducts idle + setup (ct 1 min: 60 - 15 - 30 = 15 allowed)', () => {
    const base = {
      changes: [], logHours: [], shiftFor: () => SHIFT, draftShiftCode: 'SHIFT-A',
      cycleTimeMin: 1, standardQtyPerHour: 60, plannedQty: 10000, settings: {}, role: 'operator',
    }
    const row = (qty) => ({ hour_slot: 1, log_date: '2026-11-13', shift_code: 'SHIFT-A', qty_produced: qty, qty_rejected: 0, qty_rework: 0, setup_min: 15, lunch: 30 })
    expect(hourQtyCapProblems({ ...base, newRows: [row(15)] }).blocks).toHaveLength(0)
    expect(hourQtyCapProblems({ ...base, newRows: [row(16)] }).blocks.length).toBeGreaterThan(0)
  })
})
