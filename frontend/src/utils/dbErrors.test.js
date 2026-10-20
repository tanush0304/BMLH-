import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dbErrorMessage, isQtyLimitError } from './dbErrors'

// The 036 guard messages, one per screen / save path (text as the DB raises it).
const DB_REFUSALS = {
  'RM Issue': 'Quantity issued (60) is more than the current stock of TEST-RM01 (50)',
  'RM Receipt edit': 'Quantity received can be lowered to at least 40 -- the rest of TEST-RM01 has already been issued',
  'WIP Receipt': 'WIP receipt qty (12) is more than the quantity available to receive from this stage (10)',
  'WIP Receipt edit': 'WIP receipt qty can be lowered to at least 3 -- the rest has already been issued from WIP',
  'WIP Issue': 'WIP issue qty (9) is more than the WIP balance of this stage (5)',
  'FG Receipt': 'FG receipt qty (5) is more than the quantity that can be received (2): 2 by production (last stage accepted - FG received), 1512 by order (order qty - FG received)',
  'FG Receipt edit': 'FG receipt qty can be lowered to at least 2 -- the rest has already been dispatched',
  'FG Dispatch (stock)': 'Dispatch qty (3) is more than the FG stock of PRD-018 (2)',
  'FG Dispatch (order)': 'Dispatch qty (20) is more than the remaining order quantity (10)',
  'Production log start': 'Planned qty (40) is more than the quantity available for this stage (30)',
}

describe('DB quantity refusals (036) are shown as the DB wrote them', () => {
  it.each(Object.entries(DB_REFUSALS))('%s', (_screen, message) => {
    const error = { code: '23514', message }
    expect(isQtyLimitError(error)).toBe(true)
    expect(dbErrorMessage(error)).toBe(message)
  })

  it('a bare permission error is translated; others pass through; empty -> fallback', () => {
    expect(dbErrorMessage({ code: '42501', message: 'permission denied for table wip transactions' })).toBe('You do not have permission to make this change.')
    expect(dbErrorMessage({ code: '42501', message: 'Only a supervisor or admin can edit a stock transaction' })).toBe('Only a supervisor or admin can edit a stock transaction')
    expect(dbErrorMessage(new Error('network down'))).toBe('network down')
    expect(dbErrorMessage({}, 'Could not save the receipt.')).toBe('Could not save the receipt.')
    expect(isQtyLimitError({ code: '42501' })).toBe(false)
  })
})

// Every save path on these screens surfaces the DB message through dbErrorMessage.
const SAVE_PATHS = {
  'modules/stores/RawMaterialStoreScreen.jsx': 3, // issue, receipt, void
  'modules/stores/WipReceiptScreen.jsx': 1,
  'modules/stores/WipIssueScreen.jsx': 1,
  'modules/stores/FinishedGoodsStoreScreen.jsx': 3, // dispatch, receipt, void
  'components/StockEditPanel.jsx': 1, // every Stores Edit panel
  'modules/production/ProductionDataEntryScreen.jsx': 1, // log start
  'modules/production/ManualOperationsScreen.jsx': 1, // log start
}

describe('screens use dbErrorMessage on save', () => {
  it.each(Object.entries(SAVE_PATHS))('%s', (path, count) => {
    const src = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    expect(src).toMatch(/import \{ dbErrorMessage \} from '(\.\.\/)+utils\/dbErrors'/)
    expect(src.match(/dbErrorMessage\(e\)/g)?.length ?? 0).toBeGreaterThanOrEqual(count)
  })
})
