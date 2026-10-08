import { describe, it, expect } from 'vitest'
import { unitsProducible, validateRmIssueQuantity } from './rmStock'
import { rawMaterialPayload } from './rawMaterialSave'

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
