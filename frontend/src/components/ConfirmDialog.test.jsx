// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import ConfirmDialog, { recordLabel } from './ConfirmDialog'

afterEach(cleanup)

function setup(props = {}) {
  const onConfirm = vi.fn(async () => {})
  const onClose = vi.fn()
  render(<ConfirmDialog open recordType="customer" label="CUST-001 – Acme Components" onConfirm={onConfirm} onClose={onClose} {...props} />)
  return { onConfirm, onClose }
}

describe('ConfirmDialog', () => {
  it('title, label, body; Cancel focused by default', () => {
    setup()
    expect(screen.getByRole('heading').textContent).toBe('Delete customer?')
    expect(screen.getByRole('alertdialog').textContent).toContain("CUST-001 – Acme Components will be permanently deleted. This can't be undone.")
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
  })
  it('Cancel, Esc, backdrop and Enter on Cancel close without deleting', () => {
    const { onConfirm, onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.mouseDown(screen.getByRole('presentation'))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Enter' })
    expect(onClose).toHaveBeenCalledTimes(3)
    expect(onConfirm).not.toHaveBeenCalled()
  })
  it('Delete calls the handler once, spinner + both buttons disabled while pending, then closes', async () => {
    let resolve
    const onConfirm = vi.fn(() => new Promise((r) => { resolve = r }))
    const { onClose } = setup({ onConfirm })
    const del = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(del)
    fireEvent.click(del)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(del.disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true)
    expect(del.querySelector('.animate-spin')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => { resolve() })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('closes after a failed delete too (the screen shows the error)', async () => {
    const onConfirm = vi.fn(async () => { throw new Error('x') })
    const { onClose } = setup({ onConfirm })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete' })) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('custom title / body / button text (Weekly Plan Grid "Remove")', () => {
    setup({ title: 'Remove planned maintenance?', body: 'MC-01 – week of 03-11-2026 will be removed from the maintenance plan.', confirmLabel: 'Remove' })
    expect(screen.getByRole('heading').textContent).toBe('Remove planned maintenance?')
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })
  it('closed -> renders nothing; recordLabel joins key + name', () => {
    render(<ConfirmDialog open={false} onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(recordLabel('MC-01', 'CNC Lathe')).toBe('MC-01 – CNC Lathe')
    expect(recordLabel('MC-01', '')).toBe('MC-01')
  })
})
