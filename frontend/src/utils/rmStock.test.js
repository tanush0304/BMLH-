import { describe, it, expect } from 'vitest'
import { unitsProducible, validateRmIssueQuantity } from './rmStock'
import { rawMaterialPayload, supplierRowPayload } from './rawMaterialSave'

const BOM = [
  { part_serial_number: 'P1', raw_material_code: 'RM1', consumption_per_unit: 2.5 },
  { part_serial_number: 'P2', raw_material_code: 'RM1', consumption_per_unit: 0 },
]

describe('unitsProducible', () => {
  it('floors closing stock / consumption for the part + material pair', () => {
    expect(unitsProducible(11, BOM, 'P1', 'RM1')).toBe(4)
  })
  it('is null with no BOM row or zero consumption', () => {
    expect(unitsProducible(11, BOM, 'P3', 'RM1')).toBeNull()
    expect(unitsProducible(11, BOM, 'P2', 'RM1')).toBeNull()
  })
})

describe('validateRmIssueQuantity', () => {
  it('allows up to the closing stock', () => {
    expect(validateRmIssueQuantity('10', 10)).toBeNull()
  })
  it('rejects more than stock, zero and non-numbers', () => {
    expect(validateRmIssueQuantity('11', 10)).toMatch(/more than the current stock/)
    expect(validateRmIssueQuantity('0', 10)).toMatch(/greater than zero/)
    expect(validateRmIssueQuantity('abc', 10)).toMatch(/greater than zero/)
  })
})

describe('rawMaterialPayload', () => {
  it('maps blank new fields to DB-friendly values', () => {
    expect(rawMaterialPayload({ raw_material_code: 'RM1', rm_source: '', opening_stock: '', cost_per_unit: '' })).toEqual({
      raw_material_code: 'RM1', rm_source: null, opening_stock: 0, cost_per_unit: null,
    })
    expect(rawMaterialPayload({ rm_source: 'Trading', opening_stock: '5', cost_per_unit: '12.5' })).toMatchObject({
      rm_source: 'Trading', opening_stock: 5, cost_per_unit: 12.5,
    })
  })
})

describe('rawMaterialPayload -- blank numeric fields', () => {
  it('sends null (opening_stock 0) for every blank numeric field, never ""', () => {
    const p = rawMaterialPayload({
      raw_material_code: 'RM1', diameter_mm: '', length_mtrs: '', width: '', thickness: '',
      opening_stock: '', cost_per_unit: '', rm_source: '',
    })
    expect(p).toMatchObject({ length_mtrs: null, width: null, thickness: null, opening_stock: 0, cost_per_unit: null, rm_source: null })
    expect(p.diameter_mm).toBe('') // text column, unchanged
    expect(Object.values(p).filter((v) => v === '').length).toBe(1)
  })
  it('converts filled numeric fields to numbers', () => {
    expect(rawMaterialPayload({ length_mtrs: '6', width: '0', thickness: '2.5' })).toMatchObject({ length_mtrs: 6, width: 0, thickness: 2.5 })
  })
})

describe('supplierRowPayload -- blank numeric fields', () => {
  it('sends null for blank price / lead time', () => {
    expect(supplierRowPayload({ supplier_id: 'S1', standard_purchase_price: '', lead_time_days: '' })).toEqual({
      supplier_id: 'S1', standard_purchase_price: null, lead_time_days: null,
    })
    expect(supplierRowPayload({ supplier_id: 'S1', standard_purchase_price: '12', lead_time_days: '7' })).toEqual({
      supplier_id: 'S1', standard_purchase_price: 12, lead_time_days: 7,
    })
  })
})
