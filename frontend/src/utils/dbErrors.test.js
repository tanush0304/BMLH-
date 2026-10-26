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

describe('friendlyDbMessage', async () => {
  const { friendlyDbMessage } = await import('./dbErrors')
  const started = `PRD-017 can't be cancelled: production has already started on it. Only PRDs with no production entries can be cancelled.`
  it('PRD started (with or without the leading "PRD ")', () => {
    expect(friendlyDbMessage('PRD PRD-017 has started (2 row(s) in "production logs") and cannot be cancelled')).toBe(started)
    expect(friendlyDbMessage('PRD-017 has started (1 row(s) in "production logs") and cannot be cancelled.')).toBe(started)
  })
  it('permission, duplicate key, network, login', () => {
    expect(friendlyDbMessage('permission denied for table production logs')).toBe('You do not have permission to make this change.')
    expect(friendlyDbMessage('permission denied for relation wip transactions')).toBe('You do not have permission to make this change.')
    expect(friendlyDbMessage('duplicate key value violates unique constraint "x_key"')).toBe('This record already exists (a value that must be unique is already used).')
    expect(friendlyDbMessage('TypeError: Failed to fetch')).toBe("Can't reach the server -- check your connection and try again.")
    expect(friendlyDbMessage('NetworkError when attempting to fetch resource.')).toBe("Can't reach the server -- check your connection and try again.")
    expect(friendlyDbMessage('Invalid login credentials')).toBe('Invalid username or password')
  })
  it('23514 quantity messages and unknown text pass through', () => {
    const qty = 'Quantity issued (60) is more than the current stock of RM-01 (50)'
    expect(friendlyDbMessage(qty)).toBe(qty)
    expect(dbErrorMessage({ code: '23514', message: qty })).toBe(qty)
    expect(friendlyDbMessage('Something else')).toBe('Something else')
    expect(friendlyDbMessage('')).toBe('')
  })
  it('dbErrorMessage applies it', () => {
    expect(dbErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "a"' })).toBe('This record already exists (a value that must be unique is already used).')
  })
})
