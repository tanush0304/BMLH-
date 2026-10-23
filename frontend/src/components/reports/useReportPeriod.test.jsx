// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import useReportPeriod from './useReportPeriod'
import { periodRange } from '../../utils/reportPeriods'

describe('useReportPeriod default period', () => {
  it('uses Last 30 Days when no default is given (every other report)', () => {
    const { result } = renderHook(() => useReportPeriod({ customerId: '' }))
    expect(result.current.barProps.period).toBe('last30')
    expect({ from: result.current.applied.from, to: result.current.applied.to }).toEqual(periodRange('last30'))
  })

  it('starts on the given default and Reset returns to it', () => {
    const { result } = renderHook(() => useReportPeriod({ customerId: '' }, { defaultPeriod: 'thisFY' }))
    const fy = periodRange('thisFY')
    expect(result.current.barProps.period).toBe('thisFY')
    expect(result.current.applied).toEqual({ ...fy, customerId: '' })

    act(() => result.current.barProps.onPeriodChange('last7'))
    act(() => result.current.setFilter('customerId')('C1'))
    act(() => result.current.barProps.onSearch())
    expect(result.current.applied.customerId).toBe('C1')

    act(() => result.current.barProps.onReset())
    expect(result.current.barProps.period).toBe('thisFY')
    expect(result.current.applied).toEqual({ ...fy, customerId: '' })
  })

  it('setRangeAndSearch applies a custom range, keeping the bar filters', () => {
    const { result } = renderHook(() => useReportPeriod({ customerId: '' }, { defaultPeriod: 'thisFY' }))
    act(() => result.current.setFilter('customerId')('C2'))
    act(() => result.current.setRangeAndSearch('2025-06-01', '2026-10-23'))
    expect(result.current.barProps.period).toBe('custom')
    expect(result.current.barProps.from).toBe('2025-06-01')
    expect(result.current.applied).toEqual({ from: '2025-06-01', to: '2026-10-23', customerId: 'C2' })
  })
})
