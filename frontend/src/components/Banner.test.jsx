// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import Banner, { showsDocumentNumber, AUTO_HIDE_MS } from './Banner'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Banner', () => {
  it('roles: error + warning = alert, success = status', () => {
    render(<><Banner tone="error" message="E" /><Banner tone="warning" message="W" /><Banner tone="success" message="S" /></>)
    expect(screen.getAllByRole('alert').map((n) => n.textContent)).toEqual(['E', 'W'])
    expect(screen.getByRole('status').textContent).toBe('S')
  })
  it('friendly text with the raw text behind "Details"; plain text has no Details', () => {
    render(<Banner tone="error" message="Invalid login credentials" />)
    expect(screen.getByRole('alert').textContent).toContain('Invalid username or password')
    expect(screen.getByText('Details').getAttribute('title')).toBe('Invalid login credentials')
    cleanup()
    render(<Banner tone="error" message="Pick a PRD first." />)
    expect(screen.queryByText('Details')).toBeNull()
  })
  it('Dismiss calls onClose; no X without onClose', () => {
    const onClose = vi.fn()
    render(<Banner tone="error" message="E" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    cleanup()
    render(<Banner tone="error" message="E" />)
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })
  it('success auto-hides after 4s (only with onClose); errors never do', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const onErr = vi.fn()
    render(<><Banner tone="success" message="Saved." onClose={onClose} /><Banner tone="error" message="E" onClose={onErr} /></>)
    act(() => { vi.advanceTimersByTime(AUTO_HIDE_MS - 1) })
    expect(onClose).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(onClose).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(10000) })
    expect(onErr).not.toHaveBeenCalled()
  })
  it('a success notice with a document number stays until dismissed', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<Banner tone="success" message="GRN-012 saved." onClose={onClose} />)
    act(() => { vi.advanceTimersByTime(60000) })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('showsDocumentNumber: every generated prefix, not plain text', () => {
    for (const t of ['GRN-001', 'RMI-003', 'WIR-005', 'WII-002', 'FGR-008', 'FGD-006', 'DC-011', 'JR-010', 'PRD-014', 'JC-013', 'CMP-2026-0002']) {
      expect(showsDocumentNumber(`Saved ${t}.`)).toBe(true)
    }
    for (const t of ['Saved.', 'Shift approved.', 'ADC-12x', 'Hours saved for 3 rows']) expect(showsDocumentNumber(t)).toBe(false)
  })
})
