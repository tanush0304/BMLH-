import { describe, expect, it } from 'vitest'
import { filterOptions, keyAction, normalizeOptions } from './searchableSelect'

const employees = normalizeOptions([
  { value: 'BMLH-011', label: 'BMLH-011 – Bholanath' },
  { value: 'BMLH-002', label: 'Sachin Shukla (BMLH-002)' },
  { value: 'BMLH-013', label: 'Satyajit Dass (BMLH-013)' },
])

describe('normalizeOptions', () => {
  it('accepts plain values and {value,label}, stringifying values like a native select', () => {
    expect(normalizeOptions(['PRD-001', { value: 7, label: 'Seq 1 - Cutting' }])).toEqual([
      { value: 'PRD-001', label: 'PRD-001' },
      { value: '7', label: 'Seq 1 - Cutting' },
    ])
  })
})

describe('filterOptions', () => {
  it('matches anywhere in the label, case-insensitive', () => {
    expect(filterOptions(employees, 'b').map((o) => o.value)).toEqual(['BMLH-011', 'BMLH-002', 'BMLH-013'])
    expect(filterOptions(employees, 'BHOLA').map((o) => o.value)).toEqual(['BMLH-011'])
    expect(filterOptions(employees, 'shuk').map((o) => o.value)).toEqual(['BMLH-002'])
  })

  it('matches on the code as well as the name', () => {
    expect(filterOptions(employees, '011').map((o) => o.value)).toEqual(['BMLH-011'])
    // value-only match: label without the code still found by code
    const machines = normalizeOptions([{ value: 'MC-003', label: 'CNC 1' }])
    expect(filterOptions(machines, 'mc-0')).toHaveLength(1)
  })

  it('returns everything for a blank query and nothing for no match', () => {
    expect(filterOptions(employees, '  ')).toHaveLength(3)
    expect(filterOptions(employees, 'zzz')).toEqual([])
  })
})

describe('keyAction', () => {
  const list = employees

  it('ArrowDown opens the list, then moves down and stops at the last row', () => {
    let s = keyAction('ArrowDown', { open: false, highlight: -1 }, list)
    expect(s).toMatchObject({ open: true, highlight: 0, preventDefault: true })
    s = keyAction('ArrowDown', s, list)
    s = keyAction('ArrowDown', s, list)
    s = keyAction('ArrowDown', s, list)
    expect(s.highlight).toBe(2)
  })

  it('ArrowUp moves up and stops at the first row', () => {
    const s = keyAction('ArrowUp', { open: true, highlight: 0 }, list)
    expect(s.highlight).toBe(0)
    expect(keyAction('ArrowUp', { open: true, highlight: 2 }, list).highlight).toBe(1)
  })

  it('Enter picks the highlighted option and closes', () => {
    const s = keyAction('Enter', { open: true, highlight: 1 }, list)
    expect(s.pick).toEqual(list[1])
    expect(s.open).toBe(false)
  })

  it('Enter with nothing highlighted (e.g. no matches) picks nothing', () => {
    expect(keyAction('Enter', { open: true, highlight: -1 }, []).pick).toBeUndefined()
  })

  it('Escape closes without picking', () => {
    const s = keyAction('Escape', { open: true, highlight: 1 }, list)
    expect(s).toMatchObject({ open: false, highlight: -1 })
    expect(s.pick).toBeUndefined()
  })

  it('Tab closes without picking and is not consumed, so focus moves on', () => {
    const s = keyAction('Tab', { open: true, highlight: 1 }, list)
    expect(s).toMatchObject({ open: false })
    expect(s.pick).toBeUndefined()
    expect(s.preventDefault).toBeFalsy()
  })

  it('arrow keys on an empty filtered list keep nothing highlighted', () => {
    expect(keyAction('ArrowDown', { open: true, highlight: -1 }, []).highlight).toBe(-1)
  })
})
