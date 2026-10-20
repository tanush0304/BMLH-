import { describe, expect, it } from 'vitest'
import {
  VOID_TYPES,
  isVoided,
  excludeVoided,
  sumExcludingVoided,
  voidBlockReason,
  voidReasonError,
  voidRpcArgs,
  voidedLabel,
  voidRowClass,
} from './voidEntry'
import { dcEditBlockReason } from './jobwork'
import { mergeDispatchRows } from '../modules/jobOrder/JobOrderDispatchScreen'

const voided = { voided_at: '2026-10-19T09:00:00Z', voided_by: 'u1', void_reason: 'typo' }

describe('void entry (034)', () => {
  it('reason is required', () => {
    expect(voidReasonError('')).toMatch(/reason/)
    expect(voidReasonError('   ')).toMatch(/reason/)
    expect(voidReasonError('wrong PRD')).toBeNull()
  })

  it('rpc payload: doc type, doc no, trimmed reason', () => {
    expect(voidRpcArgs('GRN', 'GRN-004', '  duplicate  ')).toEqual({ p_doc_type: 'GRN', p_doc_no: 'GRN-004', p_reason: 'duplicate' })
  })

  it('already void is blocked for every type', () => {
    expect(voidBlockReason(VOID_TYPES.GRN, { doc_no: 'GRN-1', qty: 5, ...voided }, { closingStock: 100 })).toBe('GRN-1 is already void.')
    expect(voidBlockReason(VOID_TYPES.FGD, { doc_no: 'FGD-1', ...voided })).toBe('FGD-1 is already void.')
    expect(voidBlockReason(VOID_TYPES.DC, { dc_no: 'DC-1', ...voided })).toBe('DC-1 is already void.')
  })

  it('DC: only open with no receipts; otherwise use Close Short', () => {
    const open = { dc_no: 'DC-011', is_open: true, closed_short_at: null, qty_received: null, receipt_count: 0 }
    expect(voidBlockReason(VOID_TYPES.DC, open)).toBeNull()
    expect(voidBlockReason(VOID_TYPES.DC, { ...open, qty_received: 5, receipt_count: 1 })).toBe('DC-011 has receipts -- use Close Short instead.')
    expect(voidBlockReason(VOID_TYPES.DC, { ...open, is_open: false })).toBe('DC-011 is closed -- use Close Short instead.')
    expect(voidBlockReason(VOID_TYPES.DC, { ...open, closed_short_at: 'x' })).toMatch(/Close Short/)
  })

  it('GRN: blocked when its stock has already been issued', () => {
    const grn = { doc_no: 'GRN-007', qty: 50 }
    expect(voidBlockReason(VOID_TYPES.GRN, grn, { closingStock: 50 })).toBeNull()
    expect(voidBlockReason(VOID_TYPES.GRN, grn, { closingStock: 30 })).toBe('GRN-007 cannot be voided: 20 of it has already been issued (closing stock 30).')
  })

  it('FGD: allowed', () => {
    expect(voidBlockReason(VOID_TYPES.FGD, { doc_no: 'FGD-004', qty: 10 })).toBeNull()
  })

  it('nothing picked', () => {
    expect(voidBlockReason(VOID_TYPES.FGD, null)).toMatch(/Pick a row/)
  })

  it('voided rows are left out of stock / totals', () => {
    const rows = [{ qty: 10 }, { qty: 5, ...voided }, { qty: 7 }]
    expect(excludeVoided(rows)).toHaveLength(2)
    expect(sumExcludingVoided(rows, 'qty')).toBe(17)
    expect(isVoided(rows[1])).toBe(true)
  })

  it('label (hover + export) and strike-through', () => {
    expect(voidedLabel({ ...voided }, [{ user_id: 'u1', employee_name: 'Asha' }])).toMatch(/^VOID by Asha on .+: typo$/)
    expect(voidedLabel({})).toBe('')
    expect(voidRowClass(voided)).toMatch(/line-through/)
    expect(voidRowClass({})).toBe('')
  })

  it('edit is refused on a voided DC', () => {
    expect(dcEditBlockReason({ dc_no: 'DC-011', is_open: false, ...voided })).toBe('DC-011 is void and can no longer be edited.')
  })

  it('Dispatch list: view rows + voided DCs from the table, marked Void', () => {
    const status = [{ dc_no: 'DC-010', dispatch_date: '2026-10-19', qty: 1, status: 'Sent', is_open: true }]
    const table = [
      { dc_no: 'DC-010', dispatch_date: '2026-10-19', qty: 1, edited_at: null },
      { dc_no: 'DC-011', dispatch_date: '2026-10-20', qty: 4, is_open: false, ...voided },
    ]
    const rows = mergeDispatchRows(status, table)
    expect(rows.map((r) => r.dc_no)).toEqual(['DC-011', 'DC-010'])
    expect(rows[0]).toMatchObject({ status: 'Void', qty_received: 0, void_reason: 'typo' })
    expect(rows[1].voided_at).toBeNull()
  })
})
