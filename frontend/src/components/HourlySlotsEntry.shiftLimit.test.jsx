// @vitest-environment jsdom
// 046 on the hourly grid: "Shift X: N hrs, used, remaining" banner, Save
// Hours blocked past the gross shift (this log + other logs on the machine),
// and past the NET hours (slot minutes - Lunch), Add Hour disabled at the
// limit for operators (supervisor / admin may run overtime), and the per-hour Setup column (blank -> null; editable on saved
// rows like the other idle columns).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import HourlySlotsEntry from './HourlySlotsEntry'

const SHIFT = { shift_code: 'SHIFT-A', start_time: '08:00', end_time: '12:00', lunch_break_duration: '60 min' } // 4 h gross, 3 h net
const saved = (slot, extra = {}) => ({
  id: slot, hour_slot: slot, log_date: '2026-11-12', shift_code: 'SHIFT-A', employee_id: 'E1',
  qty_produced: 5, qty_rejected: 0, qty_rework: 0, opr_issue: 0, program_issue: 0, tool_issue: 0,
  power_issue: 0, inspection: 0, breakdown: 0, mc_clean: 0, lunch: 0, setup_min: null, remarks: null, ...extra,
})

function setup(props = {}) {
  const onSaveHours = vi.fn(async () => {})
  const onAddExtraHour = vi.fn(async () => {})
  render(
    <HourlySlotsEntry
      startTime={SHIFT.start_time}
      endTime={SHIFT.end_time}
      shiftCode="SHIFT-A"
      logHours={[]}
      employees={[]}
      onSaveHours={onSaveHours}
      onAddExtraHour={onAddExtraHour}
      saving={false}
      resetKey="k"
      entryDate="2026-11-12"
      showIdle
      {...props}
    />,
  )
  return { onSaveHours, onAddExtraHour }
}
afterEach(() => cleanup())

const banner = () => screen.getByTestId('shift-hours-banner').textContent
const saveBtn = () => screen.getByRole('button', { name: 'Save Hours' })
const addBtn = () => screen.getByRole('button', { name: /^Add Hour/ })

describe('HourlySlotsEntry -- shift-hours limit (046)', () => {
  it('banner counts this log + other logs on the machine; blocks Save past the limit', async () => {
    const { onSaveHours } = setup({
      logHours: [saved(1)],
      // another log on the machine already worked 1.5 h (slot 3 + half of slot 4 lunch)
      hoursLimit: { shift: SHIFT, otherRows: [{ id: 90, hour_slot: 3, lunch: 0 }, { id: 91, hour_slot: 4, lunch: 30 }], canOvertime: false, machineLabel: 'MC-012' },
    })
    expect(banner()).toBe('SHIFT-A: 3 net hrs, worked 2.5, remaining 0.5')
    fireEvent.change(screen.getByLabelText('Hour 2 produced'), { target: { value: '4' } })
    await waitFor(() => expect(banner()).toContain('these rows add 1'))
    expect(screen.getByRole('alert').textContent).toBe(
      'SHIFT-A allows 3 net hrs on MC-012 for 12-11-2026 -- 2.5 worked (incl. other logs), 0.5 remaining; these rows add 1.',
    )
    expect(saveBtn().disabled).toBe(true)
    fireEvent.click(saveBtn())
    expect(onSaveHours).not.toHaveBeenCalled()
  })

  it('all gross slots with lunch in the Lunch column save; Add Hour disabled for an operator once full', async () => {
    const { onSaveHours } = setup({
      logHours: [saved(1), saved(2), saved(3)],
      hoursLimit: { shift: SHIFT, otherRows: [], canOvertime: false, machineLabel: 'MC-012' },
    })
    // all 4 gross slots: the break hour goes in the Lunch column -> 3 worked
    fireEvent.change(screen.getByLabelText('Hour 4 produced'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Hour 4 Lunch'), { target: { value: '60' } })
    expect(saveBtn().disabled).toBe(false)
    fireEvent.click(saveBtn())
    await waitFor(() => expect(onSaveHours).toHaveBeenCalledTimes(1))
    cleanup()
    setup({ logHours: [saved(1), saved(2), saved(3), saved(4, { lunch: 60 })], hoursLimit: { shift: SHIFT, otherRows: [], canOvertime: false } })
    expect(banner()).toBe('SHIFT-A: 3 net hrs, worked 3, remaining 0')
    expect(addBtn().disabled).toBe(true)
  })

  it('supervisor / admin: Add Hour past the shift end stays enabled, banner shows overtime', async () => {
    const { onAddExtraHour } = setup({
      logHours: [saved(1), saved(2), saved(3), saved(4)],
      hoursLimit: { shift: SHIFT, otherRows: [], canOvertime: true },
    })
    expect(banner()).toContain('worked 4, remaining 0')
    expect(banner()).toContain('overtime 1 hrs')
    expect(addBtn().disabled).toBe(false)
    fireEvent.click(addBtn())
    await waitFor(() => expect(onAddExtraHour).toHaveBeenCalledWith(expect.objectContaining({ hour_slot: 5 })))
  })

  it('no hoursLimit -> no banner (unchanged grid)', () => {
    setup()
    expect(screen.queryByTestId('shift-hours-banner')).toBeNull()
  })
})

describe('HourlySlotsEntry -- Setup column (046)', () => {
  it('only with withSetup; blank setup saved as null, typed value as a number', async () => {
    const { onSaveHours } = setup({ withSetup: true })
    expect(screen.getByLabelText('Hour 1 Setup')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Hour 1 produced'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Hour 2 produced'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Hour 2 Setup'), { target: { value: '15' } })
    fireEvent.click(saveBtn())
    await waitFor(() => expect(onSaveHours).toHaveBeenCalledTimes(1))
    const [newRows] = onSaveHours.mock.calls[0]
    expect(newRows.find((r) => r.hour_slot === 1).setup_min).toBeNull()
    expect(newRows.find((r) => r.hour_slot === 2).setup_min).toBe(15)
  })

  it('setup counts in the 60-min idle check', () => {
    setup({ withSetup: true })
    fireEvent.change(screen.getByLabelText('Hour 1 Setup'), { target: { value: '40' } })
    fireEvent.change(screen.getByLabelText('Hour 1 Lunch'), { target: { value: '30' } })
    expect(screen.getByText(/Total idle 70 min exceeds 60 min/)).toBeTruthy()
    expect(saveBtn().disabled).toBe(true)
  })

  it('a saved row can get setup later (sent as a change of that row only)', async () => {
    const { onSaveHours } = setup({ withSetup: true, logHours: [saved(1)] })
    fireEvent.change(screen.getByLabelText('Hour 1 Setup'), { target: { value: '10' } })
    fireEvent.click(saveBtn())
    await waitFor(() => expect(onSaveHours).toHaveBeenCalledTimes(1))
    const [newRows, changes] = onSaveHours.mock.calls[0]
    expect(newRows).toEqual([])
    expect(changes).toEqual([{ id: 1, setup_min: 10 }])
  })

  it('before 046 (withSetup false): no Setup column, nothing about setup sent', async () => {
    const { onSaveHours } = setup()
    expect(screen.queryByLabelText('Hour 1 Setup')).toBeNull()
    fireEvent.change(screen.getByLabelText('Hour 1 produced'), { target: { value: '4' } })
    fireEvent.click(saveBtn())
    await waitFor(() => expect(onSaveHours).toHaveBeenCalledTimes(1))
    expect(onSaveHours.mock.calls[0][0][0]).not.toHaveProperty('setup_min')
  })
})
