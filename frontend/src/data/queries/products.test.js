import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/supabaseClient', () => {
  const single = vi.fn(() =>
    Promise.resolve({ data: { part_serial_number: 'HPV2-NEW', part_name: 'New HPV2 Variant' }, error: null })
  )
  const select = vi.fn(() => ({ single }))
  const insert = vi.fn(() => ({ select }))
  const from = vi.fn(() => ({ insert }))
  return { supabase: { from } }
})

import { normalizePartCode, resolveOrCreateProduct, resolveProductWithConfirmation } from './products'

const KNOWN_PRODUCTS = [
  { part_serial_number: 'HPV2', part_name: 'HPV2 Rotor' },
  { part_serial_number: 'HPV3', part_name: 'HPV3 Rotor' },
]

describe('normalizePartCode', () => {
  it('treats case, spaces and hyphens as equivalent', () => {
    expect(normalizePartCode('HPV2')).toBe('hpv2')
    expect(normalizePartCode('hpv2')).toBe('hpv2')
    expect(normalizePartCode('HPV 2')).toBe('hpv2')
    expect(normalizePartCode('HPV-2')).toBe('hpv2')
    expect(normalizePartCode('  hpv2  ')).toBe('hpv2')
  })
})

describe('resolveOrCreateProduct', () => {
  it('not a new part -- passes the picked partSerialNumber straight through', async () => {
    const r = await resolveOrCreateProduct({ isNewPart: false, partSerialNumber: 'HPV2', knownProducts: KNOWN_PRODUCTS })
    expect(r).toEqual({ status: 'existing', partSerialNumber: 'HPV2', knownProducts: KNOWN_PRODUCTS })
  })

  it('exact match (same text, same case) reuses it silently -- no near-match prompt', async () => {
    const r = await resolveOrCreateProduct({
      isNewPart: true,
      newPartCode: 'HPV2',
      partName: 'irrelevant',
      knownProducts: KNOWN_PRODUCTS,
    })
    expect(r).toEqual({ status: 'existing', partSerialNumber: 'HPV2', knownProducts: KNOWN_PRODUCTS })
  })

  it('trimming alone that produces an exact match reuses it silently, not a near-match prompt', async () => {
    const r = await resolveOrCreateProduct({
      isNewPart: true,
      newPartCode: '  HPV2  ',
      partName: 'irrelevant',
      knownProducts: KNOWN_PRODUCTS,
    })
    expect(r).toEqual({ status: 'existing', partSerialNumber: 'HPV2', knownProducts: KNOWN_PRODUCTS })
  })

  it('a near-match ("hpv2", "HPV 2", "hpv-2") is flagged, not silently created', async () => {
    for (const typed of ['hpv2', 'HPV 2', 'hpv-2']) {
      const r = await resolveOrCreateProduct({
        isNewPart: true,
        newPartCode: typed,
        partName: 'irrelevant',
        knownProducts: KNOWN_PRODUCTS,
      })
      expect(r).toEqual({ status: 'near-match', match: { part_serial_number: 'HPV2', part_name: 'HPV2 Rotor' } })
    }
  })

  it('confirmCreateNew: true bypasses the near-match check and actually creates it', async () => {
    const r = await resolveOrCreateProduct({
      isNewPart: true,
      newPartCode: 'hpv2',
      partName: 'Deliberately separate part',
      knownProducts: KNOWN_PRODUCTS,
      confirmCreateNew: true,
    })
    expect(r.status).toBe('created')
    expect(r.partSerialNumber).toBe('HPV2-NEW') // from the mocked insert response
    expect(r.knownProducts).toHaveLength(3)
  })

  it('a genuinely new code with no near-match creates it directly', async () => {
    const r = await resolveOrCreateProduct({
      isNewPart: true,
      newPartCode: '  Brand New Part  ',
      partName: '  Some Name  ',
      drawingNumber: '  DWG-1  ',
      knownProducts: KNOWN_PRODUCTS,
    })
    expect(r.status).toBe('created')
    expect(r.knownProducts).toHaveLength(3)
  })
})

describe('resolveProductWithConfirmation', () => {
  it('passes non-near-match results straight through without prompting', async () => {
    const confirmFn = vi.fn()
    const r = await resolveProductWithConfirmation(
      { isNewPart: true, newPartCode: 'Totally New', partName: 'X', knownProducts: KNOWN_PRODUCTS },
      confirmFn
    )
    expect(confirmFn).not.toHaveBeenCalled()
    expect(r.status).toBe('created')
  })

  it('on a near-match, confirming "yes" reuses the existing part and creates nothing', async () => {
    const confirmFn = vi.fn(() => true)
    const r = await resolveProductWithConfirmation(
      { isNewPart: true, newPartCode: 'hpv2', partName: 'irrelevant', knownProducts: KNOWN_PRODUCTS },
      confirmFn
    )
    expect(confirmFn).toHaveBeenCalledTimes(1)
    expect(confirmFn.mock.calls[0][0]).toContain('HPV2')
    expect(r).toEqual({ status: 'existing', partSerialNumber: 'HPV2', knownProducts: KNOWN_PRODUCTS })
  })

  it('on a near-match, declining creates the new part anyway', async () => {
    const confirmFn = vi.fn(() => false)
    const r = await resolveProductWithConfirmation(
      { isNewPart: true, newPartCode: 'hpv2', partName: 'A real separate part', knownProducts: KNOWN_PRODUCTS },
      confirmFn
    )
    expect(confirmFn).toHaveBeenCalledTimes(1)
    expect(r.status).toBe('created')
    expect(r.knownProducts).toHaveLength(3)
  })
})
