import { describe, it, expect } from 'vitest'
import { csvField, buildCsv } from './exportUtils'

describe('CSV export', () => {
  it('quotes every field and doubles embedded quotes', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('6" bar')).toBe('"6"" bar"')
    expect(csvField(null)).toBe('""')
    expect(csvField(0)).toBe('"0"')
  })
  it('keeps columns aligned when values contain commas', () => {
    const cols = [{ key: 'op', label: 'Operation' }, { key: 'qty', label: 'Qty' }]
    expect(buildCsv(cols, [{ op: 'Turning, Facing', qty: 5 }])).toBe('"Operation","Qty"\n"Turning, Facing","5"')
  })
})
