// @vitest-environment jsdom
// Masters > App Settings (051): admin edits the hourly cap mode + tolerance.
import { createElement } from 'react'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
const q = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(async (key, value) => ({ key, value })),
}))
vi.mock('../../data/queries/appSettings', () => ({
  HOUR_CAP_KEYS: { mode: 'hour_qty_cap_mode', tolerance: 'hour_qty_cap_tolerance_pct' },
  listAppSettings: q.list,
  saveAppSetting: q.save,
}))
vi.mock('../../data/queries/appUsers', () => ({ listAppUsers: vi.fn(async () => [{ user_id: 'u-1', employee_id: 'EMP-9' }]) }))

const { default: AppSettingsScreen } = await import('./AppSettingsScreen')

const ROWS = [
  { key: 'hour_qty_cap_mode', value: 'strict', updated_by: 'u-1', updated_at: '2026-11-13T05:00:00Z' },
  { key: 'hour_qty_cap_tolerance_pct', value: '0', updated_by: null, updated_at: '2026-11-12T05:00:00Z' },
]

afterEach(() => {
  cleanup()
  q.list.mockReset()
  q.save.mockClear()
})

describe('App Settings screen', () => {
  it('admin: loads the values, saves mode + tolerance', async () => {
    q.list.mockResolvedValue({ supported: true, rows: ROWS })
    render(createElement(AppSettingsScreen, { role: 'admin' }))
    const mode = await screen.findByLabelText('Hourly cap mode')
    await waitFor(() => expect(mode.value).toBe('strict'))
    expect(screen.getByTestId('settings-last-change').textContent).toContain('Last changed by')
    fireEvent.change(mode, { target: { value: 'supervisor_override' } })
    fireEvent.change(screen.getByLabelText('Hourly cap tolerance'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
    await waitFor(() => expect(q.save).toHaveBeenCalledTimes(2))
    expect(q.save).toHaveBeenCalledWith('hour_qty_cap_mode', 'supervisor_override')
    expect(q.save).toHaveBeenCalledWith('hour_qty_cap_tolerance_pct', '10')
  })

  it('tolerance over 100: message, Save disabled', async () => {
    q.list.mockResolvedValue({ supported: true, rows: ROWS })
    render(createElement(AppSettingsScreen, { role: 'admin' }))
    const tol = await screen.findByLabelText('Hourly cap tolerance')
    fireEvent.change(tol, { target: { value: '150' } })
    expect(screen.getByText('Tolerance must be a number from 0 to 100.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save Settings' }).disabled).toBe(true)
  })

  it('not an admin: read only', async () => {
    q.list.mockResolvedValue({ supported: true, rows: ROWS })
    render(createElement(AppSettingsScreen, { role: 'supervisor' }))
    const mode = await screen.findByLabelText('Hourly cap mode')
    expect(mode.disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Save Settings' }).disabled).toBe(true)
  })

  it('before 051: notice, defaults shown, nothing editable', async () => {
    q.list.mockResolvedValue({ supported: false, rows: [] })
    render(createElement(AppSettingsScreen, { role: 'admin' }))
    expect(await screen.findByText(/Migration 051 has not been run yet/)).toBeTruthy()
    expect(screen.getByLabelText('Hourly cap mode').disabled).toBe(true)
  })
})
