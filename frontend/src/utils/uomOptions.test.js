import { describe, it, expect } from 'vitest'
import { uomOptions, BUILT_IN_UOMS } from './uomOptions'

describe('uomOptions', () => {
  it('combines built-ins with units saved on products and raw materials', () => {
    const opts = uomOptions([{ unit_of_measurement: 'Box' }, { unit_of_measurement: 'Nos' }], [{ unit_of_measurement: 'Roll' }, { unit_of_measurement: null }])
    expect(opts).toEqual([...BUILT_IN_UOMS, 'Box', 'Roll'])
  })
})
