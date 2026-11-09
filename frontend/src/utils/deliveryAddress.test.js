// Phase C (042): delivery address validation, default selection, display
// helpers, Deliver To rules, Order Type rule, Customer Order Status filters.
import { describe, it, expect } from 'vitest'
import {
  deliveryAddressProblem,
  deliveryAddressPayload,
  defaultAddressId,
  deliveryLabel,
  deliveryOptionLabel,
  deliveryAddressLines,
  deliveryForLine,
  deliveryForPrd,
  deliveryText,
  addressMap,
  deliverToProblem,
  deliverToOptions,
  deliveryIdOrNull,
  orderLineSuffix,
  PINCODE_MESSAGE,
  GSTIN_MESSAGE,
} from './deliveryAddress'
import { orderTypeProblem, DEFAULT_ORDER_TYPE, ORDER_TYPES, ORDER_TYPE_REQUIRED } from './orderType'
import { filterOrderLines } from './reportOrders'

const ADDR = [
  { id: 1, customer_id: 'CUST-001', label: 'Default', city: 'Chennai', is_default: true, is_active: true },
  { id: 2, customer_id: 'CUST-001', label: 'Plant 1 - Hosur', city: 'Hosur', address: '12 SIPCOT', state: 'TN', pincode: '635126', gstin: '33AAAAA0000A1Z5', is_default: false, is_active: true },
  { id: 3, customer_id: 'CUST-001', label: 'Old Plant', city: 'Salem', is_default: false, is_active: false },
  { id: 4, customer_id: 'CUST-002', label: 'Main', city: 'Pune', is_default: false, is_active: true },
]

describe('deliveryAddressProblem', () => {
  it('label required (blank after trim)', () => {
    expect(deliveryAddressProblem({ label: '   ' })).toEqual({ field: 'label', error: 'Label is required.' })
  })
  it('duplicate label per customer, case-insensitive, ignoring spaces', () => {
    expect(deliveryAddressProblem({ label: ' plant 1 - hosur ' }, ADDR.slice(0, 3))?.field).toBe('label')
    expect(deliveryAddressProblem({ label: 'Plant 2' }, ADDR.slice(0, 3))).toBeNull()
  })
  it('pincode must be 6 digits when filled (spaces ignored)', () => {
    expect(deliveryAddressProblem({ label: 'A', pincode: '6351' })).toEqual({ field: 'pincode', error: PINCODE_MESSAGE })
    expect(deliveryAddressProblem({ label: 'A', pincode: '635 126' })).toBeNull()
    expect(deliveryAddressProblem({ label: 'A', pincode: '' })).toBeNull()
  })
  it('GSTIN format only when filled (lower case accepted, upper-cased on save)', () => {
    expect(deliveryAddressProblem({ label: 'A', gstin: '33ABC' })).toEqual({ field: 'gstin', error: GSTIN_MESSAGE })
    expect(deliveryAddressProblem({ label: 'A', gstin: '33aaaaa0000a1z5' })).toBeNull()
    expect(deliveryAddressProblem({ label: 'A', gstin: '' })).toBeNull()
  })
  it('an inactive address cannot be the default', () => {
    expect(deliveryAddressProblem({ label: 'A', is_default: true, is_active: false })?.field).toBe('is_default')
  })
})

describe('deliveryAddressPayload', () => {
  it('trims, blanks -> null, pincode digits, GSTIN upper, default only when active', () => {
    const p = deliveryAddressPayload(
      { label: ' Plant 1 ', address: '  ', city: ' Hosur ', pincode: '635 126', gstin: ' 33aaaaa0000a1z5 ', is_default: true, is_active: false },
      'CUST-001'
    )
    expect(p).toMatchObject({ customer_id: 'CUST-001', label: 'Plant 1', address: null, city: 'Hosur', pincode: '635126', gstin: '33AAAAA0000A1Z5', is_active: false, is_default: false })
  })
})

describe('default selection', () => {
  it('picks the default active address', () => {
    expect(defaultAddressId(ADDR, 'CUST-001')).toBe(1)
  })
  it('falls back to the only active address, else none', () => {
    expect(defaultAddressId(ADDR, 'CUST-002')).toBe(4)
    expect(defaultAddressId([...ADDR, { id: 5, customer_id: 'CUST-002', label: 'B', is_active: true }], 'CUST-002')).toBe('')
    expect(defaultAddressId(ADDR, 'CUST-009')).toBe('')
    expect(defaultAddressId(ADDR, '')).toBe('')
  })
})

describe('display helpers', () => {
  it('label · city; city left out when blank or equal to the label', () => {
    expect(deliveryLabel(ADDR[1])).toBe('Plant 1 - Hosur · Hosur')
    expect(deliveryLabel({ label: 'Hosur', city: 'hosur' })).toBe('Hosur')
    expect(deliveryLabel({ label: 'Main', city: '' })).toBe('Main')
    expect(deliveryLabel(null)).toBe('')
    expect(deliveryOptionLabel(ADDR[2])).toBe('Old Plant · Salem (inactive)')
  })
  it('full address block lines', () => {
    expect(deliveryAddressLines(ADDR[1])).toEqual(['Plant 1 - Hosur', '12 SIPCOT', 'Hosur, TN - 635126', 'GSTIN: 33AAAAA0000A1Z5'])
    expect(deliveryAddressLines(null)).toEqual([])
  })
  it('line / PRD lookups', () => {
    const byId = addressMap(ADDR)
    expect(deliveryForLine({ delivery_address_id: 2 }, byId)?.label).toBe('Plant 1 - Hosur')
    expect(deliveryForLine({ delivery_address_id: null }, byId)).toBeNull()
    expect(deliveryForPrd([{ prd_no: 'PRD-1', delivery_address_id: 4 }], 'PRD-1', byId)?.label).toBe('Main')
    expect(deliveryText({ delivery_address_id: 99 }, byId)).toBe('')
  })
  it('running banner suffix', () => {
    expect(orderLineSuffix({ order_type: 'Manufacturing', deliver_to: 'Plant 1 - Hosur · Hosur' })).toBe(' · Manufacturing · Plant 1 - Hosur · Hosur')
    expect(orderLineSuffix({ order_type: 'Labour', deliver_to: '' })).toBe(' · Labour')
    expect(orderLineSuffix({})).toBe('')
  })
})

describe('Deliver To on a PO line', () => {
  const base = { supported: true, addresses: ADDR, customerId: 'CUST-001' }
  it('not checked before 042', () => {
    expect(deliverToProblem({ ...base, supported: false, deliveryAddressId: '' })).toBeNull()
  })
  it('required when the customer has active addresses', () => {
    expect(deliverToProblem({ ...base, deliveryAddressId: '' })).toMatch(/Deliver To is required/)
    expect(deliverToProblem({ ...base, customerId: 'CUST-009', deliveryAddressId: '' })).toBeNull()
  })
  it('refuses another customer\'s address and a newly picked inactive one', () => {
    expect(deliverToProblem({ ...base, deliveryAddressId: '4' })).toMatch(/another customer/)
    expect(deliverToProblem({ ...base, deliveryAddressId: '3' })).toMatch(/inactive/)
    expect(deliverToProblem({ ...base, deliveryAddressId: '3', currentId: 3 })).toBeNull()
    expect(deliverToProblem({ ...base, deliveryAddressId: '2' })).toBeNull()
  })
  it('options = active addresses (+ the line\'s current inactive one)', () => {
    expect(deliverToOptions(ADDR, 'CUST-001').map((o) => o.value)).toEqual(['1', '2'])
    expect(deliverToOptions(ADDR, 'CUST-001', 3).map((o) => o.label)).toContain('Old Plant · Salem (inactive)')
    expect(deliverToOptions(ADDR, '')).toEqual([])
  })
  it('id for the DB', () => {
    expect(deliveryIdOrNull('2')).toBe(2)
    expect(deliveryIdOrNull('')).toBeNull()
    expect(deliveryIdOrNull(null)).toBeNull()
  })
})

describe('Order Type', () => {
  it('required, Labour / Manufacturing only, default Manufacturing', () => {
    expect(DEFAULT_ORDER_TYPE).toBe('Manufacturing')
    expect(ORDER_TYPES).toEqual(['Labour', 'Manufacturing'])
    expect(orderTypeProblem('')).toBe(ORDER_TYPE_REQUIRED)
    expect(orderTypeProblem(null)).toBe(ORDER_TYPE_REQUIRED)
    expect(orderTypeProblem('Other')).toBe(ORDER_TYPE_REQUIRED)
    expect(orderTypeProblem('Labour')).toBeNull()
  })
})

describe('Customer Order Status filters', () => {
  const lines = [
    { order_line_id: 1, order_type: 'Manufacturing', delivery_address_id: 1 },
    { order_line_id: 2, order_type: 'Labour', delivery_address_id: 2 },
    { order_line_id: 3, order_type: ' Manufacturing ', delivery_address_id: null },
  ]
  it('no filter = all', () => {
    expect(filterOrderLines(lines, {})).toHaveLength(3)
  })
  it('Order Type', () => {
    expect(filterOrderLines(lines, { orderType: 'Manufacturing' }).map((l) => l.order_line_id)).toEqual([1, 3])
  })
  it('Deliver To (id as string from the filter bar)', () => {
    expect(filterOrderLines(lines, { deliveryAddressId: '2' }).map((l) => l.order_line_id)).toEqual([2])
  })
  it('both', () => {
    expect(filterOrderLines(lines, { orderType: 'Labour', deliveryAddressId: '1' })).toEqual([])
  })
})
