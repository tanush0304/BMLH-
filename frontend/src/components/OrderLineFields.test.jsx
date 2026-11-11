// @vitest-environment jsdom
// Read-only Order Type / Deliver To boxes (Data Entry, Manual Ops, WIP, FG,
// Jobwork, Quality, Traceability) + FG Despatch address block + the 042 probe.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

const sb = vi.hoisted(() => ({ result: { error: null }, calls: 0 }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        limit: async () => {
          sb.calls += 1
          return sb.result
        },
      }),
    }),
  },
}))

import OrderLineFields, { DeliveryAddressBlock } from './OrderLineFields'
import { deliveryAddressesSupported, resetDeliveryAddressesSupportedCache, isMissingTableError } from '../data/queries/deliveryAddresses'

const PART = {
  order_type: 'Manufacturing',
  deliver_to: 'Plant 1 - Hosur · Hosur',
  delivery: { label: 'Plant 1 - Hosur', address: '12 SIPCOT', city: 'Hosur', state: 'TN', pincode: '635126' },
}

beforeEach(() => {
  resetDeliveryAddressesSupportedCache()
  sb.calls = 0
  sb.result = { error: null }
})
afterEach(() => cleanup())

describe('042 probe', () => {
  it('missing table -> false (cached); present -> true', async () => {
    sb.result = { error: { code: 'PGRST205', message: "Could not find the table 'public.customer delivery addresses'" } }
    expect(await deliveryAddressesSupported()).toBe(false)
    expect(await deliveryAddressesSupported()).toBe(false)
    expect(sb.calls).toBe(1)
    resetDeliveryAddressesSupportedCache()
    sb.result = { error: null }
    expect(await deliveryAddressesSupported()).toBe(true)
  })
  it('network error is not cached', async () => {
    sb.result = { error: { message: 'Failed to fetch' } }
    expect(await deliveryAddressesSupported()).toBe(false)
    sb.result = { error: null }
    expect(await deliveryAddressesSupported()).toBe(true)
    expect(sb.calls).toBe(2)
  })
  it('recognises missing-table errors', () => {
    expect(isMissingTableError({ code: '42P01' })).toBe(true)
    expect(isMissingTableError({ message: 'relation "customer delivery addresses" does not exist' })).toBe(true)
    expect(isMissingTableError({ code: '42501' })).toBe(false)
  })
})

describe('OrderLineFields', () => {
  it('before 042: Order Type only', async () => {
    sb.result = { error: { code: 'PGRST205' } }
    render(<OrderLineFields part={PART} />)
    expect(screen.getByText('Manufacturing')).toBeTruthy()
    await waitFor(() => expect(sb.calls).toBe(1))
    expect(screen.queryByText('Deliver To')).toBeNull()
  })
  it('after 042: Deliver To label · city with the full address as tooltip', async () => {
    render(<OrderLineFields part={PART} />)
    const box = await screen.findByText('Plant 1 - Hosur · Hosur')
    expect(box.closest('[title]').getAttribute('title')).toBe('Plant 1 - Hosur\n12 SIPCOT\nHosur, TN - 635126')
  })
})

describe('DeliveryAddressBlock', () => {
  it('renders the full block, blank without an address', () => {
    const { rerender } = render(<DeliveryAddressBlock address={{ ...PART.delivery, gstin: '33AAAAA0000A1Z5' }} />)
    expect(screen.getByTestId('delivery-address-block').textContent).toBe('Plant 1 - Hosur\n12 SIPCOT\nHosur, TN - 635126\nGSTIN: 33AAAAA0000A1Z5')
    rerender(<DeliveryAddressBlock address={null} />)
    expect(screen.getByTestId('delivery-address-block').textContent.trim()).toBe('')
  })
})
