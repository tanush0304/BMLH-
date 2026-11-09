// @vitest-environment jsdom
// Bell + "Needs attention" pop-up: role gating, once per session ("Got it"),
// "Remind me later" pops again on the next Main Menu visit, bell count, Open.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('./alertSources', () => ({ ALERT_SOURCES: [] }))

import { AlertsProvider, useAlertsState } from './AlertsContext'
import AlertBell from './AlertBell'
import NeedsAttentionDialog from './NeedsAttentionDialog'

const ITEMS = [
  { id: 'dc:DC-004', text: 'DC-004 · Alpha · 00190 · overdue by 8 days (expected 30-10-2026, lead time 10 days) · 200 pcs', open: { topKey: 'job-order', subKey: 'receipt', mode: 'dc:DC-004' } },
  { id: 'dc:DC-005', text: 'DC-005 · Beta · PRD-003 · overdue by 1 day (expected 06-11-2026, lead time 5 days) · 50 pcs', open: { topKey: 'job-order', subKey: 'receipt', mode: 'dc:DC-005' } },
]
const source = (items) => ({ key: 'overdue-dcs', title: 'Jobwork DCs overdue', load: vi.fn(async () => items), toItems: (d) => d })

function Harness({ role, onMainMenu = true, sources, onOpen = () => {} }) {
  const alerts = useAlertsState({ role, userId: 'user-1', onMainMenu, sources })
  return (
    <AlertsProvider value={alerts}>
      <AlertBell />
      <NeedsAttentionDialog onOpenItem={onOpen} />
    </AlertsProvider>
  )
}

beforeEach(() => sessionStorage.clear())
afterEach(() => cleanup())

describe('Needs attention', () => {
  it('supervisor with overdue DCs: pop-up lists them, bell shows the count', async () => {
    const sources = [source(ITEMS)]
    render(<Harness role="supervisor" sources={sources} />)
    expect(await screen.findByRole('dialog', { name: 'Needs attention' })).toBeTruthy()
    expect(screen.getByText(ITEMS[0].text)).toBeTruthy()
    expect(screen.getByText(ITEMS[1].text)).toBeTruthy()
    expect(screen.getByTestId('alert-count').textContent).toBe('2')
  })

  it('no overdue DCs: no pop-up, bell shows 0 and opens an empty list', async () => {
    const sources = [source([])]
    render(<Harness role="admin" sources={sources} />)
    await waitFor(() => expect(sources[0].load).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('alert-count').textContent).toBe('0')
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(screen.getByText('Nothing needs attention right now.')).toBeTruthy()
  })

  it('operator: no bell, no pop-up, nothing loaded', async () => {
    const sources = [source(ITEMS)]
    render(<Harness role="operator" sources={sources} />)
    await act(async () => {})
    expect(screen.queryByRole('button', { name: /Notifications/ })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(sources[0].load).not.toHaveBeenCalled()
  })

  it('"Got it": no pop-up again this session; the bell still opens the list', async () => {
    const sources = [source(ITEMS)]
    const { rerender } = render(<Harness role="supervisor" sources={sources} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    // Leave and come back to the Main Menu: reloads, but no pop-up.
    rerender(<Harness role="supervisor" sources={sources} onMainMenu={false} />)
    rerender(<Harness role="supervisor" sources={sources} onMainMenu />)
    await waitFor(() => expect(sources[0].load).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('alert-count').textContent).toBe('2')

    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(screen.getByRole('dialog', { name: 'Needs attention' })).toBeTruthy()
  })

  it('"Remind me later": pops again on the next Main Menu visit', async () => {
    const sources = [source(ITEMS)]
    const { rerender } = render(<Harness role="supervisor" sources={sources} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Remind me later' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(<Harness role="supervisor" sources={sources} onMainMenu={false} />)
    rerender(<Harness role="supervisor" sources={sources} onMainMenu />)
    expect(await screen.findByRole('dialog', { name: 'Needs attention' })).toBeTruthy()
  })

  it('sessionStorage that throws: still works (just not remembered)', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    const sources = [source(ITEMS)]
    render(<Harness role="supervisor" sources={sources} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    get.mockRestore()
    set.mockRestore()
  })

  it('Open closes the list and goes to the DC', async () => {
    const onOpen = vi.fn()
    render(<Harness role="supervisor" sources={[source(ITEMS)]} onOpen={onOpen} />)
    await screen.findByRole('dialog', { name: 'Needs attention' })
    fireEvent.click(screen.getAllByRole('button', { name: /^Open/ })[0])
    expect(onOpen).toHaveBeenCalledWith({ topKey: 'job-order', subKey: 'receipt', mode: 'dc:DC-004' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
