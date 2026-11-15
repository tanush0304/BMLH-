// @vitest-environment jsdom
// 2026-11-15: hourly produced / rejected / rework must be whole numbers >= 0
// (blank = 0), checked before Save Hours / Add Hour; inputs carry min=0 step=1.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import HourlySlotsEntry from './HourlySlotsEntry'

function setup({ showIdle = true } = {}) {
  const onSaveHours = vi.fn(async () => {})
  const onAddExtraHour = vi.fn(async () => {})
  render(
    <HourlySlotsEntry
      startTime="08:00"
      endTime="10:00"
      shiftCode="SHIFT-A"
      logHours={[]}
      employees={[]}
      onSaveHours={onSaveHours}
      onAddExtraHour={onAddExtraHour}
      saving={false}
      resetKey="k"
      entryDate="2026-11-15"
      showIdle={showIdle}
    />,
  )
  return { onSaveHours, onAddExtraHour }
}
afterEach(() => cleanup())

describe('HourlySlotsEntry -- qty validation', () => {
  it('inputs have min=0 step=1', () => {
    setup()
    const input = screen.getByLabelText('Hour 1 produced')
    expect(input.getAttribute('min')).toBe('0')
    expect(input.getAttribute('step')).toBe('1')
  })

  it.each([true, false])('negative produced blocks Save (showIdle=%s, Data Entry / Manual Ops)', (showIdle) => {
    const { onSaveHours } = setup({ showIdle })
    fireEvent.change(screen.getByLabelText('Hour 1 produced'), { target: { value: '-5' } })
    expect(screen.getByText("Hour 1: produced can't be less than 0.")).toBeTruthy()
    const save = screen.getByRole('button', { name: 'Save Hours' })
    expect(save.disabled).toBe(true)
    fireEvent.click(save)
    expect(onSaveHours).not.toHaveBeenCalled()
  })

  it('decimal rejected blocks Save; fixing it saves whole numbers', async () => {
    const { onSaveHours } = setup()
    fireEvent.change(screen.getByLabelText('Hour 1 produced'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Hour 1 rejected'), { target: { value: '1.5' } })
    expect(screen.getByText('Hour 1: rejected must be a whole number.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Hour 1 rejected'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Hours' }))
    await waitFor(() => expect(onSaveHours).toHaveBeenCalledTimes(1))
    expect(onSaveHours.mock.calls[0][0][0]).toMatchObject({ qty_produced: 10, qty_rejected: 1, qty_rework: 0 })
  })

  it('Add Hour refuses a negative qty with a message and sends nothing', () => {
    const { onAddExtraHour } = setup()
    fireEvent.change(screen.getByLabelText('Qty Produced'), { target: { value: '-3' } })
    fireEvent.click(screen.getByRole('button', { name: /Add Hour/ }))
    expect(screen.getByRole('alert').textContent).toMatch(/produced can't be less than 0/)
    expect(onAddExtraHour).not.toHaveBeenCalled()
  })
})
