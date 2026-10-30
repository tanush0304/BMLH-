// @vitest-environment jsdom
// WIP Status charts: balance 0 at To -> "No WIP stock at <To>" on the two
// balance charts (not "No data"); trend over the selected period (not the
// last 10 days); carried stock draws the line; stock > 0 draws every chart.
import { cloneElement } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { todayISO } from '../../utils/dates'
import { addDays, displayDate, shortDate } from '../../utils/reportPeriods'

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, ResponsiveContainer: ({ children }) => cloneElement(children, { width: 800, height: 300 }) }
})
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
const data = vi.hoisted(() => ({ txns: [] }))
vi.mock('../../data/queries/reports', () => ({ listWipTransactionsUpTo: async () => data.txns }))
vi.mock('../../data/queries/customerOrders', () => ({ listOrdersByPrd: async () => [{ prd_no: 'PRD-002', prd_qty: 200 }] }))
vi.mock('../../data/queries/routeCards', () => ({ listAllStages: async () => [{ id: 129, prd_no: 'PRD-002', seq: 10, operation: 'Turning', type: 'Internal' }] }))

import WipStatusScreen from './WipStatusScreen'

const T = todayISO()
const FROM = addDays(T, -29) // default period: last 30 days
const tx = (date, type, qty) => ({ id: `${date}${type}`, prd_no: 'PRD-002', nature_of_operation_stage_id: 129, transaction_date: date, transaction_type: type, qty })
const card = (title) => screen.getByText(title).closest('section')
const NO_STOCK = `No WIP stock at ${displayDate(T)} -- everything received has been issued.`
const trendTitle = `WIP Status (${shortDate(FROM)} to ${shortDate(T)})`

afterEach(() => cleanup())

describe('WIP Status charts', () => {
  it('balance 0 at To: both balance charts say "No WIP stock", the period trend shows the movement', async () => {
    data.txns = [tx(addDays(T, -15), 'Receipt', 20), tx(addDays(T, -15), 'Issue', 20)]
    render(<WipStatusScreen />)
    await screen.findByText('PRD-002')
    expect(within(card('WIP Quantity by Operation')).getByText(NO_STOCK)).toBeTruthy()
    expect(within(card('WIP Status')).getByText(NO_STOCK)).toBeTruthy()
    expect(screen.queryByText('No data for this period.')).toBeNull()
    // Movement 15 days back is inside the 30-day period (the old 10-day window missed it).
    const trend = card(trendTitle)
    expect(within(trend).queryByText('No WIP movement in this period')).toBeNull()
    expect(trend.querySelector('svg')).toBeTruthy()
    // Received / Issued bars + Closing WIP line, as on FG Inventory.
    for (const name of ['Received', 'Issued', 'Closing WIP']) expect(within(trend).getByText(name)).toBeTruthy()
  })

  it('stock carried in from before From with no movement in the period: the trend still draws (flat line)', async () => {
    data.txns = [tx(addDays(T, -60), 'Receipt', 30)]
    render(<WipStatusScreen />)
    await screen.findByText('PRD-002')
    const trend = card(trendTitle)
    expect(within(trend).queryByText('No WIP movement in this period')).toBeNull()
    expect(trend.querySelector('svg')).toBeTruthy()
    expect(within(card('WIP Quantity by Operation')).queryByText(NO_STOCK)).toBeNull()
  })

  it('stock > 0: every chart draws, no empty messages', async () => {
    data.txns = [tx(addDays(T, -3), 'Receipt', 50), tx(addDays(T, -2), 'Issue', 20)]
    render(<WipStatusScreen />)
    await screen.findByText('PRD-002')
    expect(screen.queryByText(NO_STOCK)).toBeNull()
    expect(screen.queryByText('No data for this period.')).toBeNull()
    expect(screen.queryByText('No WIP movement in this period')).toBeNull()
    expect(card('WIP Quantity by Operation').querySelector('svg')).toBeTruthy()
  })

  it('nothing at all in the period: plain "No data" stays', async () => {
    data.txns = []
    render(<WipStatusScreen />)
    expect((await screen.findAllByText('No data for this period.')).length).toBe(3)
  })
})
