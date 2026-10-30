// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import Banner, { AUTO_HIDE_MS, showsDocumentNumber } from './Banner'

afterEach(() => { cleanup(); vi.useRealTimers() })
const RAW = 'PRD PRD-009 has started (3 row(s) in "production logs") and cannot be cancelled'

describe('Banner toast', () => {
  it('error: role="alert", friendly text, raw message in the Details tooltip, dismissable', () => {
    const onClose = vi.fn()
    render(<Banner tone="error" message={RAW} onClose={onClose} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain("PRD-009 can't be cancelled")
    expect(screen.getByText('Details').getAttribute('title')).toBe(RAW)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders in a portal on document.body, fixed top-centre above dialogs', () => {
    const { container } = render(<div className="overflow-y-auto"><Banner tone="error" message="Customer ID is required." /></div>)
    expect(container.querySelector('[role="alert"]')).toBeNull() // not inside the screen
    const toast = screen.getByTestId('toast')
    expect(toast.parentElement).toBe(document.body)
    expect(toast.className).toMatch(/\bfixed\b/)
    expect(toast.className).toContain('z-[60]')
    expect(toast.className).toContain('justify-center')
    expect(screen.getByRole('alert').className).toContain('toast-in')
    expect(screen.getByRole('alert').className).toContain('max-w-[640px]')
  })

  it.each([
    ['error', 'bg-red-600', 'text-white', 'alert'],
    ['warning', 'bg-amber-500', 'text-slate-900', 'alert'],
    ['success', 'bg-green-600', 'text-white', 'status'],
  ])('%s tone: solid %s, %s, role=%s', (tone, bg, text, role) => {
    render(<Banner tone={tone} message="Something happened." />)
    const el = screen.getByRole(role)
    expect(el.className).toContain(bg)
    expect(el.className).toContain(text)
    expect(el.className).toContain('shadow-2xl')
  })

  it('no Details when the text is already readable; nothing rendered without a message', () => {
    render(<Banner tone="error" message="Select a Customer PO No and Part first." />)
    expect(screen.queryByText('Details')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
    cleanup()
    render(<Banner tone="error" message={null} />)
    expect(screen.queryByTestId('toast')).toBeNull()
  })

  it('one toast at a time: the newest replaces the older, which returns when the newest clears', () => {
    function Screen() {
      const [error, setError] = useState('Old error.')
      const [notice, setNotice] = useState('')
      return (
        <>
          <button onClick={() => setNotice('Saved.')}>notice</button>
          <Banner tone="error" message={error} onClose={() => setError(null)} />
          <Banner tone="success" message={notice} onClose={() => setNotice('')} />
        </>
      )
    }
    vi.useFakeTimers()
    render(<Screen />)
    expect(screen.getAllByTestId('toast')).toHaveLength(1)
    expect(screen.getByRole('alert').textContent).toContain('Old error.')
    fireEvent.click(screen.getByText('notice'))
    expect(screen.getAllByTestId('toast')).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toContain('Saved.')
    expect(screen.queryByRole('alert')).toBeNull()
    act(() => { vi.advanceTimersByTime(AUTO_HIDE_MS) })
    expect(screen.getByRole('alert').textContent).toContain('Old error.')
  })

  it('errors and warnings stay; plain success hides after 4s', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<Banner tone="warning" message="Shift crosses midnight." onClose={onClose} />)
    act(() => { vi.advanceTimersByTime(AUTO_HIDE_MS * 3) })
    expect(onClose).not.toHaveBeenCalled()
    cleanup()
    render(<Banner tone="success" message="Visit updated." onClose={onClose} />)
    act(() => { vi.advanceTimersByTime(AUTO_HIDE_MS - 1) })
    expect(onClose).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('success naming a generated document number stays until dismissed', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<Banner tone="success" message="Planned PRD-012, PRD-013 -- PO line fully planned." onClose={onClose} />)
    act(() => { vi.advanceTimersByTime(AUTO_HIDE_MS * 3) })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('doc-number rule', () => {
    for (const t of ['GRN-12 saved', 'RMI-3', 'WIR-4', 'WII-5', 'FGR-6', 'FGD-7', 'DC-8', 'JR-9', 'PRD-010', 'JC-11', 'Complaint CMP-2026-0002 registered']) {
      expect(showsDocumentNumber(t)).toBe(true)
    }
    for (const t of ['Saved.', 'CMP-26-1', 'XGRN-12', 'ADC-12x', 'GRN-', 'PRD 10', 'Shift A approved', 'Hours saved for 3 rows']) {
      expect(showsDocumentNumber(t)).toBe(false)
    }
  })

  it('`inline` keeps a standing note in the page flow (no portal), light colours, own role', () => {
    const { container } = render(<Banner tone="warning" message="This complaint is closed." inline />)
    const el = container.querySelector('[role="alert"]')
    expect(el).toBeTruthy()
    expect(el.className).toContain('bg-amber-50')
    expect(screen.queryByTestId('toast')).toBeNull()
    cleanup()
    const r = render(<><Banner tone="error" message="Invalid login credentials" inline /><Banner tone="success" message="S" inline /></>)
    expect(r.container.querySelector('[role="alert"]').textContent).toContain('Invalid username or password')
    expect(r.container.querySelector('[role="status"]').textContent).toBe('S')
  })

  it('inline banners do not take the toast slot', () => {
    render(<><Banner tone="error" message="Toast error." /><Banner tone="warning" message="Inline note." inline /></>)
    expect(screen.getByTestId('toast').textContent).toContain('Toast error.')
    expect(screen.getAllByRole('alert')).toHaveLength(2)
  })
})
