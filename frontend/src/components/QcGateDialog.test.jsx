// @vitest-environment jsdom
// useQcGate (055): the one popup for the four gated insert paths.
import { render, screen, waitFor, cleanup, fireEvent, within, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const q = vi.hoisted(() => ({
  supported: true,
  data: null,
  createQcOverride: vi.fn(async (p) => ({ id: 1, ...p })),
  load: vi.fn(),
}))
vi.mock('../data/queries/jobworkQc', () => ({
  jobworkQcGateSupported: async () => q.supported,
  loadQcGateData: (...a) => q.load(...a),
  createQcOverride: (...a) => q.createQcOverride(...a),
}))

const { useQcGate } = await import('./QcGateDialog')

const STAGES = [
  { id: 4, prd_no: 'PRD-012', seq: 40, type: 'Outsourced', operation: 'Toughening' },
  { id: 5, prd_no: 'PRD-012', seq: 50, type: 'Internal', operation: 'Finish Turning ONE' },
]
const blocking = (receipts = [{ id: 8, dc_no: 'DC-008', receipt_no: 'JR-008', qty_received: 411, receipt_date: '2026-11-15', created_at: '2026-11-17T00:00:00Z' }]) => ({
  settings: { on: true, from: null },
  stages: STAGES,
  dispatches: [{ dc_no: 'DC-008', stage_id: 4, prd_no: 'PRD-012' }],
  receipts,
  qcLogs: [],
  overrides: [],
})

let result
function Harness({ role }) {
  const gate = useQcGate({ role })
  return (
    <>
      <button type="button" onClick={async () => { result = await gate.check({ prdNo: 'PRD-012', targetStageId: 5 }) }}>Go</button>
      {gate.dialog}
    </>
  )
}

beforeEach(() => {
  q.supported = true
  result = undefined
  q.load.mockReset().mockImplementation(async () => blocking())
  q.createQcOverride.mockReset().mockImplementation(async (p) => ({ id: 1, ...p }))
})
afterEach(cleanup)

async function go(role) {
  render(<Harness role={role} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Go' })))
}

describe('useQcGate', () => {
  it('before 055: allowed at once, nothing loaded', async () => {
    q.supported = false
    await go('operator')
    await waitFor(() => expect(result).toBe(true))
    expect(q.load).not.toHaveBeenCalled()
  })

  it('nothing blocking (accepted): allowed, no popup', async () => {
    q.load.mockImplementation(async () => ({ ...blocking(), qcLogs: [{ id: 1, receipt_id: 8, log_date: '2026-11-16', inspection_result: 'Accepted' }] }))
    await go('operator')
    await waitFor(() => expect(result).toBe(true))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(q.load).toHaveBeenCalledWith({ prdNo: 'PRD-012' })
  })

  it('lookup failure: not blocked here (the DB guard still refuses)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    q.load.mockRejectedValue(new Error('offline'))
    await go('operator')
    await waitFor(() => expect(result).toBe(true))
    warn.mockRestore()
  })

  it('operator: popup with the message, OK only -> blocked', async () => {
    await go('operator')
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Incoming quality check pending')).toBeTruthy()
    expect(within(dialog).getByTestId('qc-gate-messages').textContent).toBe(
      'PRD-012: Toughening (DC-008, JR-008) was received on 15-11-2026 but has no quality inspection yet. Ask Quality to inspect it before starting Stage 2.',
    )
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['OK'])
    expect(within(dialog).queryByLabelText('Override reason')).toBeNull()
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'OK' })))
    await waitFor(() => expect(result).toBe(false))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(q.createQcOverride).not.toHaveBeenCalled()
  })

  it('supervisor: override needs a reason; one override per blocking receipt, then allowed', async () => {
    q.load.mockImplementation(async () => blocking([
      { id: 8, dc_no: 'DC-008', receipt_no: 'JR-008', qty_received: 400, receipt_date: '2026-11-15', created_at: '2026-11-17T00:00:00Z' },
      { id: 9, dc_no: 'DC-008', receipt_no: 'JR-009', qty_received: 11, receipt_date: '2026-11-16', created_at: '2026-11-17T00:00:00Z' },
    ]))
    await go('supervisor')
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByTestId('qc-gate-messages').children).toHaveLength(2)
    const override = within(dialog).getByRole('button', { name: 'Override and continue' })
    expect(override.disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText('Override reason'), { target: { value: '  Sorted 100%, accepted on deviation ' } })
    expect(override.disabled).toBe(false)
    await act(async () => fireEvent.click(override))
    await waitFor(() => expect(result).toBe(true))
    expect(q.createQcOverride.mock.calls.map((c) => c[0])).toEqual([
      { receiptId: 8, reason: 'Sorted 100%, accepted on deviation' },
      { receiptId: 9, reason: 'Sorted 100%, accepted on deviation' },
    ])
  })

  it('supervisor: Cancel -> blocked, nothing saved', async () => {
    await go('admin')
    const dialog = await screen.findByRole('alertdialog')
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' })))
    await waitFor(() => expect(result).toBe(false))
    expect(q.createQcOverride).not.toHaveBeenCalled()
  })

  it('override refused by the DB: popup stays open with the error, not allowed', async () => {
    q.createQcOverride.mockRejectedValue(new Error('Only a supervisor or admin can override the incoming quality check.'))
    await go('supervisor')
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.change(within(dialog).getByLabelText('Override reason'), { target: { value: 'x' } })
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Override and continue' })))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Only a supervisor or admin/)
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(result).toBeUndefined()
  })
})
