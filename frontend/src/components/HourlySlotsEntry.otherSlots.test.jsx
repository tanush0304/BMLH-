// @vitest-environment jsdom
// 2026-11-12: on the hourly grid, slots other logs on the same machine already
// used for the date + shift are closed ("used by PRD-x"), and so is every slot
// before the last of them -- new hours go after it. This log's own saved rows
// stay editable; Add Hour continues after the last used slot.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import HourlySlotsEntry from './HourlySlotsEntry'
import ConfirmDialog from './ConfirmDialog'

const SHIFT = { shift_code: 'SHIFT-A', start_time: '08:00', end_time: '14:00', lunch_break_duration: '0' } // 6 slots
const saved = (slot) => ({
  id: slot, hour_slot: slot, log_date: '2026-11-12', shift_code: 'SHIFT-A', employee_id: 'E1',
  qty_produced: 5, qty_rejected: 0, qty_rework: 0, opr_issue: 0, program_issue: 0, tool_issue: 0,
  power_issue: 0, inspection: 0, breakdown: 0, mc_clean: 0, lunch: 0, setup_min: null, remarks: null,
})
const other = (slot, prd) => ({ id: 900 + slot, log_id: 5, prd_no: prd, hour_slot: slot, lunch: 0 })

function setup({ logHours = [], otherRows = [], hoursLimit = true } = {}) {
  const onSaveHours = vi.fn(async () => {})
  const onAddExtraHour = vi.fn(async () => {})
  render(
    <HourlySlotsEntry
      startTime={SHIFT.start_time}
      endTime={SHIFT.end_time}
      shiftCode="SHIFT-A"
      logHours={logHours}
      employees={[]}
      onSaveHours={onSaveHours}
      onAddExtraHour={onAddExtraHour}
      saving={false}
      resetKey="k"
      entryDate="2026-11-12"
      showIdle
      hoursLimit={hoursLimit ? { shift: SHIFT, otherRows, canOvertime: true, machineLabel: 'MC-012' } : null}
    />,
  )
  return { onSaveHours, onAddExtraHour }
}
afterEach(() => cleanup())

describe('HourlySlotsEntry -- slots used by other logs', () => {
  it('used slots and the gap before the last used one are closed; typing starts after it', async () => {
    const { onSaveHours } = setup({ otherRows: [other(1, 'PRD-003'), other(3, 'PRD-007')] })
    expect(screen.getByTestId('slot-blocked-1').textContent).toContain('used by PRD-003')
    expect(screen.getByTestId('slot-blocked-2').textContent).toContain("before PRD-007's last hour")
    expect(screen.getByTestId('slot-blocked-3').textContent).toContain('used by PRD-007')
    expect(screen.queryByLabelText('Hour 1 produced')).toBeNull()
    expect(screen.queryByLabelText('Hour 3 produced')).toBeNull()
    fireEvent.change(screen.getByLabelText('Hour 4 produced'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Hours' }))
    await waitFor(() => expect(onSaveHours).toHaveBeenCalledTimes(1))
    expect(onSaveHours.mock.calls[0][0].map((r) => r.hour_slot)).toEqual([4])
  })

  it("this log's own saved slot stays editable even before another log's last hour", () => {
    setup({ logHours: [saved(2)], otherRows: [other(1, 'PRD-003'), other(3, 'PRD-007')] })
    expect(screen.getByLabelText('Hour 2 produced')).toBeTruthy()
    expect(screen.queryByTestId('slot-blocked-2')).toBeNull()
  })

  it('Add Hour continues after the last slot used by any log', () => {
    setup({ otherRows: [other(7, 'PRD-003')] })
    expect(screen.getByRole('button', { name: /^Add Hour/ }).textContent).toBe('Add Hour 8')
  })

  it('without hoursLimit (Manual Operations) nothing is closed', () => {
    setup({ hoursLimit: false })
    expect(screen.queryByTestId(/slot-blocked-/)).toBeNull()
    expect(screen.getByLabelText('Hour 1 produced')).toBeTruthy()
  })
})

describe('ConfirmDialog -- OK-only notice', () => {
  it('hideCancel shows one button (focused); tone notice; OK closes', async () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    render(<ConfirmDialog open tone="notice" hideCancel title="Machine is busy" body="MC-012 is running PRD-003." confirmLabel="OK" onConfirm={onConfirm} onClose={onClose} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['OK'])
    expect(document.activeElement).toBe(buttons[0])
    expect(screen.getByText('MC-012 is running PRD-003.').className).toContain('amber')
    fireEvent.click(buttons[0])
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onConfirm).toHaveBeenCalled()
  })

  it('defaults unchanged: Cancel + Delete, Cancel focused', () => {
    render(<ConfirmDialog open recordType="customer" label="CUST-001" onConfirm={vi.fn()} onClose={vi.fn()} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Cancel', 'Delete'])
    expect(document.activeElement).toBe(buttons[0])
  })
})
