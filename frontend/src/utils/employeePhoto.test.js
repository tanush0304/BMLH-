import { describe, it, expect } from 'vitest'
import { photoFolder, photoPath, photoFileProblem, photoErrorText } from './employeePhoto'
import { fitWithin } from './imageResize'

describe('photo file names: employee id + timestamp only', () => {
  it('folder = id with every char outside [A-Za-z0-9_-] replaced (same as 060 check)', () => {
    expect(photoFolder('EMP-001')).toBe('EMP-001')
    expect(photoFolder('EMP 01/Ravi.K')).toBe('EMP_01_Ravi_K')
    expect(photoFolder('../x')).toBe('___x')
  })
  it('path = "<folder>/<timestamp>.jpg" and matches 060\'s regex', () => {
    const p = photoPath('EMP-001', 1763900000123)
    expect(p).toBe('EMP-001/1763900000123.jpg')
    expect(p).toMatch(new RegExp(`^${photoFolder('EMP-001')}/[0-9]{10,16}\\.jpg$`))
  })
})

describe('picked file checks', () => {
  it('JPEG / PNG only; 10 MB before resizing', () => {
    expect(photoFileProblem(null)).toBe('Choose a photo.')
    expect(photoFileProblem({ type: 'image/gif', size: 10 })).toBe('Only JPEG or PNG photos.')
    expect(photoFileProblem({ type: 'image/png', size: 11 * 1024 * 1024 })).toMatch(/too large/)
    expect(photoFileProblem({ type: 'image/jpeg', size: 3 * 1024 * 1024 })).toBeNull()
  })
})

describe('error texts: fixed, never a path / URL', () => {
  const leaky = { message: 'https://x.supabase.co/storage/v1/object/sign/employee-photos/EMP-1/1.jpg?token=abc' }
  it('maps codes', () => {
    expect(photoErrorText({ ...leaky, code: 'too_large' })).toBe('The photo must be under 2 MB.')
    expect(photoErrorText({ code: 'bad_type' })).toBe('Only JPEG or PNG photos.')
    expect(photoErrorText({ code: 'forbidden' })).toBe('You do not have permission to change employee photos.')
    expect(photoErrorText({ code: '42501' })).toBe('You do not have permission to change employee photos.')
    expect(photoErrorText({ code: 'resize' })).toMatch(/Could not read this image/)
    expect(photoErrorText(leaky)).toBe('Could not upload the photo.')
    expect(photoErrorText(leaky, 'load')).toBe('Could not load the photo.')
    expect(photoErrorText(leaky, 'remove')).toBe('Could not remove the photo.')
  })
  it('no text contains a URL, path or token', () => {
    for (const code of ['too_large', 'bad_type', 'forbidden', 'resize', 'storage', undefined]) {
      for (const a of ['upload', 'load', 'remove']) {
        const t = photoErrorText({ ...leaky, code }, a)
        expect(t).not.toMatch(/https?:|employee-photos|EMP-1|token/)
      }
    }
  })
})

describe('fitWithin (400 x 400, never enlarged)', () => {
  it('scales the long side to max, keeps aspect', () => {
    expect(fitWithin(4000, 3000, 400)).toEqual({ width: 400, height: 300 })
    expect(fitWithin(1080, 1920, 400)).toEqual({ width: 225, height: 400 })
    expect(fitWithin(200, 100, 400)).toEqual({ width: 200, height: 100 })
    expect(fitWithin(0, 100, 400)).toEqual({ width: 0, height: 0 })
  })
})
