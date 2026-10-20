// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ReportErrorBoundary from './ReportErrorBoundary'

function Boom() {
  throw new TypeError('series is not a function')
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ReportErrorBoundary', () => {
  it('shows the report when nothing crashes', () => {
    render(
      <ReportErrorBoundary reportKey="x" onBack={() => {}}>
        <p>Report body</p>
      </ReportErrorBoundary>
    )
    expect(screen.getByText('Report body')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a crash shows the message + Back (not a white page) and logs the error', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onBack = vi.fn()
    const { container } = render(
      <ReportErrorBoundary reportKey="quality-status" onBack={onBack}>
        <Boom />
      </ReportErrorBoundary>
    )
    expect(container.innerHTML).not.toBe('')
    expect(screen.getByRole('alert').textContent).toContain("This report couldn't load")
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalledTimes(1)
    const ours = logged.mock.calls.find((args) => String(args[0]).includes('Report "quality-status" crashed'))
    expect(ours?.[1]).toBeInstanceOf(TypeError)
  })
})
