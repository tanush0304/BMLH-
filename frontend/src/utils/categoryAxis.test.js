import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { categoryAxisProps, shouldRotate, rotatedAxisHeight, ROTATE_ANGLE, FLAT_AXIS_HEIGHT } from './categoryAxis'

const names = (n, text = 'MC-1') => Array.from({ length: n }, (_, i) => `${text}${i}`.slice(0, Math.max(text.length, 4)))

describe('categoryAxisProps -- rotate threshold', () => {
  it('<= 6 bars and every name <= 10 chars stays horizontal', () => {
    const ax = categoryAxisProps(['CNC 1', 'CNC 2', 'VMC 1', 'VMC 2', 'Cutting 1', '1234567890'])
    expect(ax.rotated).toBe(false)
    expect(ax.axis).toMatchObject({ angle: 0, textAnchor: 'middle', height: FLAT_AXIS_HEIGHT, interval: 0 })
    expect(ax.extraHeight).toBe(0)
    expect(ax.marginLeft).toBe(0)
  })

  it('a 7th bar rotates', () => {
    expect(shouldRotate(names(6))).toBe(false)
    expect(shouldRotate(names(7))).toBe(true)
  })

  it('one name of 11 chars rotates', () => {
    expect(shouldRotate(['CNC 1', '12345678901'])).toBe(true)
  })

  it('rotated = -40 deg, textAnchor end, interval 0 (every label shown)', () => {
    const ax = categoryAxisProps(['Cylindrical Grinding 1', 'CNC 2'])
    expect(ax.rotated).toBe(true)
    expect(ROTATE_ANGLE).toBe(-40)
    expect(ax.axis).toMatchObject({ angle: -40, textAnchor: 'end', interval: 0 })
  })

  it('interval is 0 in both modes; names are never shortened (no tickFormatter)', () => {
    for (const ax of [categoryAxisProps(['A']), categoryAxisProps(names(12))]) {
      expect(ax.axis.interval).toBe(0)
      expect(ax.axis.tickFormatter).toBeUndefined()
    }
  })
})

describe('categoryAxisProps -- bottom space', () => {
  it('grows with the longest name', () => {
    const short = categoryAxisProps(names(8)) // rotated by count, short names
    const long = categoryAxisProps([...names(7), 'Cylindrical Grinding 1'])
    expect(long.axis.height).toBeGreaterThan(short.axis.height)
    expect(long.extraHeight).toBe(long.axis.height - FLAT_AXIS_HEIGHT)
  })

  it('fits a 22-char name at 11 px (~0.62 em glyphs, sin 40)', () => {
    const needed = 22 * 11 * 0.62 * Math.sin((40 * Math.PI) / 180)
    expect(rotatedAxisHeight(22)).toBeGreaterThan(needed)
    expect(categoryAxisProps(['Cylindrical Grinding 1', 'x']).axis.height).toBe(rotatedAxisHeight(22))
  })

  it('is monotonic in length and never below the flat height', () => {
    let prev = 0
    for (let n = 0; n <= 40; n += 5) {
      const h = rotatedAxisHeight(n)
      expect(h).toBeGreaterThanOrEqual(Math.max(prev, FLAT_AXIS_HEIGHT))
      prev = h
    }
  })

  it('left margin grows with the first label so it is not clipped', () => {
    const a = categoryAxisProps(['CNC 1', ...names(7)])
    const b = categoryAxisProps(['Cylindrical Grinding 1', ...names(7)])
    expect(b.marginLeft).toBeGreaterThan(a.marginLeft)
  })

  it('empty / missing labels do not crash', () => {
    expect(categoryAxisProps([]).rotated).toBe(false)
    expect(categoryAxisProps(undefined).rotated).toBe(false)
    expect(categoryAxisProps([null, undefined, 'A']).rotated).toBe(false)
  })
})

describe('every category-X chart uses the helper', () => {
  const read = (f) => readFileSync(new URL(`../modules/reports/${f}`, import.meta.url), 'utf8')
  const uses = {
    'ProductionStatusScreen.jsx': 2,
    'DowntimeScreen.jsx': 1,
    'JobOrderStatusScreen.jsx': 2,
    'RawMaterialStatusScreen.jsx': 1,
    'WipStatusScreen.jsx': 1,
    'ComplaintStatusScreen.jsx': 1, // shared countChart -> 4 charts
  }
  for (const [file, n] of Object.entries(uses)) {
    it(file, () => {
      const src = read(file)
      expect(src).toContain("from '../../utils/categoryAxis'")
      expect(src.match(/<XAxis [^>]*\{\.\.\.\w+\.axis\}/g) ?? []).toHaveLength(n)
      expect(src).not.toMatch(/<XAxis [^>]*angle=/) // no hard-coded angle left
    })
  }
})
