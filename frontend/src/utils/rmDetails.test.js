import { describe, expect, it } from 'vitest'
import { rmDetails, rmDimensions } from './rmDetails'

const rm = { raw_material_code: '002', raw_material_name: 'EN31 Round Bar', raw_material_category: 'Steel', rm_type: 'Bar', diameter_mm: '90', length_mtrs: null, width: '', thickness: null, unit_of_measurement: 'Kg', rm_source: 'Trading' }

describe('rmDetails (RM Receipt read-only fields)', () => {
  it('maps type, category, UoM, source and description = name + dimensions', () => {
    expect(rmDetails(rm)).toEqual({ rm_type: 'Bar', rm_category: 'Steel', rm_uom: 'Kg', rm_source: 'Trading', rm_description: 'EN31 Round Bar – Ø90 mm' })
  })
  it('lists every filled dimension; name only when none', () => {
    expect(rmDimensions({ diameter_mm: 40, length_mtrs: 6, width: 20, thickness: 5 })).toBe('Ø40 mm × L 6 m × W 20 mm × T 5 mm')
    expect(rmDetails({ ...rm, diameter_mm: null }).rm_description).toBe('EN31 Round Bar')
  })
  it('blank fields when the material is not found', () => {
    expect(rmDetails(undefined)).toEqual({ rm_type: '', rm_category: '', rm_uom: '', rm_source: '', rm_description: '' })
  })
})
