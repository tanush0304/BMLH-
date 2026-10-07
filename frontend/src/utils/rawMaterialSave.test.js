import { describe, it, expect, vi } from 'vitest'
import { saveRawMaterialWithSuppliers, validateSupplierDraftRows } from './rawMaterialSave'

function uniqueViolation() {
  const e = new Error('duplicate key value violates unique constraint')
  e.code = '23505'
  return e
}

describe('saveRawMaterialWithSuppliers', () => {
  it('material insert fails -- stops immediately, no supplier row touched', async () => {
    const saveMaterial = vi.fn(() => Promise.reject(new Error('duplicate code')))
    const insertSupplierRow = vi.fn()
    const result = await saveRawMaterialWithSuppliers({
      materialPayload: { raw_material_code: 'RM-001' },
      supplierRows: [{ supplier_id: 'SUP-001' }],
      saveMaterial,
      insertSupplierRow,
    })
    expect(result).toEqual({ status: 'material-failed', error: 'duplicate code' })
    expect(insertSupplierRow).not.toHaveBeenCalled()
  })

  it('material saves, all supplier rows save -- success', async () => {
    const saveMaterial = vi.fn(() => Promise.resolve({ raw_material_code: 'RM-001' }))
    const insertSupplierRow = vi.fn((row) => Promise.resolve({ id: row.supplier_id, ...row }))
    const result = await saveRawMaterialWithSuppliers({
      materialPayload: { raw_material_code: 'RM-001' },
      supplierRows: [{ supplier_id: 'SUP-001' }, { supplier_id: 'SUP-002' }],
      saveMaterial,
      insertSupplierRow,
    })
    expect(result.status).toBe('success')
    expect(result.material).toEqual({ raw_material_code: 'RM-001' })
    expect(result.insertedRows).toHaveLength(2)
  })

  it('material saves, no supplier rows -- still success (suppliers optional)', async () => {
    const saveMaterial = vi.fn(() => Promise.resolve({ raw_material_code: 'RM-001' }))
    const insertSupplierRow = vi.fn()
    const result = await saveRawMaterialWithSuppliers({
      materialPayload: { raw_material_code: 'RM-001' },
      supplierRows: [],
      saveMaterial,
      insertSupplierRow,
    })
    expect(result).toEqual({ status: 'success', material: { raw_material_code: 'RM-001' }, insertedRows: [] })
    expect(insertSupplierRow).not.toHaveBeenCalled()
  })

  it('material saves, a supplier row fails -- reports which rows already succeeded', async () => {
    const saveMaterial = vi.fn(() => Promise.resolve({ raw_material_code: 'RM-001' }))
    const insertSupplierRow = vi
      .fn()
      .mockResolvedValueOnce({ id: 1, supplier_id: 'SUP-001' })
      .mockRejectedValueOnce(new Error('network error'))
    const result = await saveRawMaterialWithSuppliers({
      materialPayload: { raw_material_code: 'RM-001' },
      supplierRows: [{ supplier_id: 'SUP-001' }, { supplier_id: 'SUP-002' }],
      saveMaterial,
      insertSupplierRow,
    })
    expect(result.status).toBe('suppliers-failed')
    expect(result.insertedRows).toEqual([{ id: 1, supplier_id: 'SUP-001' }])
    expect(result.failedRow).toEqual({ supplier_id: 'SUP-002' })
    expect(result.error).toBe('network error')
  })

  it('retry: a unique-violation on a supplier row is treated as already-linked, not a failure', async () => {
    const saveMaterial = vi.fn(() => Promise.resolve({ raw_material_code: 'RM-001' }))
    const insertSupplierRow = vi
      .fn()
      .mockRejectedValueOnce(uniqueViolation())
      .mockResolvedValueOnce({ id: 2, supplier_id: 'SUP-002' })
    const result = await saveRawMaterialWithSuppliers({
      materialPayload: { raw_material_code: 'RM-001' },
      // Simulates retrying with the still-draft row (SUP-002) alongside a
      // row that actually already landed in the DB from a prior attempt
      // (SUP-001) -- the duplicate must not abort the whole retry.
      supplierRows: [{ supplier_id: 'SUP-001' }, { supplier_id: 'SUP-002' }],
      saveMaterial,
      insertSupplierRow,
    })
    expect(result.status).toBe('success')
    expect(insertSupplierRow).toHaveBeenCalledTimes(2)
  })
})

describe('validateSupplierDraftRows', () => {
  it('passes a single valid row', () => {
    expect(validateSupplierDraftRows([{ supplier_id: 'SUP-001', standard_purchase_price: '10' }])).toBeNull()
  })

  it('requires a supplier to be chosen', () => {
    expect(validateSupplierDraftRows([{ supplier_id: '' }])).toMatch(/supplier chosen/i)
  })

  it('rejects the same supplier listed twice', () => {
    const err = validateSupplierDraftRows([{ supplier_id: 'SUP-001' }, { supplier_id: 'SUP-001' }])
    expect(err).toMatch(/listed more than once/i)
  })

  it('rejects a supplier already linked (existingSupplierIds) being added again', () => {
    const err = validateSupplierDraftRows([{ supplier_id: 'SUP-001' }], ['SUP-001'])
    expect(err).toMatch(/listed more than once/i)
  })

  it('allows blank price/lead time', () => {
    expect(
      validateSupplierDraftRows([
        { supplier_id: 'SUP-001', standard_purchase_price: '', lead_time_days: '' },
      ])
    ).toBeNull()
  })

  it('rejects a negative price or lead time', () => {
    expect(validateSupplierDraftRows([{ supplier_id: 'SUP-001', standard_purchase_price: '-5' }])).toMatch(/price/i)
    expect(validateSupplierDraftRows([{ supplier_id: 'SUP-001', lead_time_days: '-2' }])).toMatch(/lead time/i)
  })

  it('zero is valid, not negative', () => {
    expect(
      validateSupplierDraftRows([{ supplier_id: 'SUP-001', standard_purchase_price: '0', lead_time_days: '0' }])
    ).toBeNull()
  })
})
