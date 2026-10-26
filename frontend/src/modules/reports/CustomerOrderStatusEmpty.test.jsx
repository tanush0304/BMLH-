// @vitest-environment jsdom
// Customer Order Status with no PO lines in the default period (This
// Financial Year): one line names the latest PO, "Show all POs" sets From to
// the earliest PO date and To to today, and reloads.
import { cloneElement } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react'
import { periodRange } from '../../utils/reportPeriods'
import { formatLocalISODate } from '../../utils/dates'

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, ResponsiveContainer: ({ children }) => cloneElement(children, { width: 800, height: 300 }) }
})
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))

const OLD_LINE = { order_line_id: 1, customer_id: 'C1', po_number: 'PO-OLD', po_date: '2024-05-10', part_serial_number: 'P1', order_qty: 50, prd_no: null }
const listOrdersByPoDate = vi.fn(async ({ from, to }) => (from <= OLD_LINE.po_date && to >= OLD_LINE.po_date ? [OLD_LINE] : []))
const getPoDateBounds = vi.fn(async () => ({
  earliest: { po_number: 'PO-OLD', po_date: '2024-05-10' },
  latest: { po_number: 'PO-LAST', po_date: '2025-02-14' },
}))
vi.mock('../../data/queries/reports', () => ({
  listOrdersByPoDate: (...a) => listOrdersByPoDate(...a),
  listFgTransactionsUpTo: vi.fn(async () => []),
  getPoDateBounds: (...a) => getPoDateBounds(...a),
}))
vi.mock('../../data/queries/customerOrders', () => ({ listProductionOrders: vi.fn(async () => []) }))
vi.mock('../../data/queries/customers', () => ({ listCustomers: vi.fn(async () => [{ customer_id: 'C1', customer_name: 'Acme' }]) }))
vi.mock('../../data/queries/products', () => ({ listProducts: vi.fn(async () => []) }))

const { ChartTypeProvider } = await import('../../components/reports/ChartTypeToggle')
const { default: CustomerOrderStatusScreen } = await import('./CustomerOrderStatusScreen')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Customer Order Status empty period', () => {
  it('defaults to This Financial Year, names the latest PO, and Show all POs searches earliest PO date..today', async () => {
    let container
    await act(async () => {
      ({ container } = render(<ChartTypeProvider initial="bar"><CustomerOrderStatusScreen onOpenTraceability={() => {}} /></ChartTypeProvider>))
    })
    const fy = periodRange('thisFY')
    expect(listOrdersByPoDate).toHaveBeenCalledWith(expect.objectContaining({ from: fy.from, to: fy.to }))

    const msg = await screen.findByText('No POs dated in this period. Latest PO: PO-LAST dated 14-02-2025.')
    expect(msg).toBeTruthy()
    expect(getPoDateBounds).toHaveBeenCalledWith({ customerId: '' })

    // Search an old range (still empty) first, so "Show all POs" must not keep its To.
    const [fromInput, toInput] = container.querySelectorAll('input[type="date"]')
    fireEvent.change(fromInput, { target: { value: '2023-01-01' } })
    fireEvent.change(toInput, { target: { value: '2024-03-31' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Search/ })) })
    expect(listOrdersByPoDate).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2023-01-01', to: '2024-03-31' }))
    await screen.findByRole('button', { name: 'Show all POs' })

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Show all POs' })) })
    expect(listOrdersByPoDate).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2024-05-10', to: formatLocalISODate(new Date()) }))
    expect(fromInput.value).toBe('2024-05-10')
    expect(toInput.value).toBe(formatLocalISODate(new Date()))
    await waitFor(() => expect(screen.queryByText(/No POs dated in this period/)).toBeNull())
    expect(screen.getAllByText('PO-OLD').length).toBeGreaterThan(0)
  })
})
