// @vitest-environment jsdom
// ChartGroup "Expand all" + "Export PNG" (one image of every chart on the
// screen). html-to-image and the download are mocked (no network).
import { readFileSync as readFs } from 'node:fs'
import { resolve } from 'node:path'
// jsdom's import.meta.url is not a file URL -> resolve from the frontend folder.
const readSrc = (rel) => readFs(resolve(process.cwd(), 'src', rel), 'utf8')
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const m = vi.hoisted(() => ({ toPng: vi.fn(), download: vi.fn(), seenAtCapture: null }))
vi.mock('html-to-image', () => ({ toPng: (...a) => m.toPng(...a) }))
vi.mock('../../utils/chartExport', async (orig) => ({ ...(await orig()), downloadDataUrl: (...a) => m.download(...a) }))

const { default: ChartGroup } = await import('./ChartGroup')
const { default: ChartCard } = await import('./ChartCard')
const { pngFilter } = await import('../../utils/chartExport')

const DATA = { columns: [{ key: 'a', label: 'A' }], rows: [{ a: 1 }] }
const group = ({ aLoading = false, bEmpty = false } = {}) =>
  render(
    <ChartGroup title="Machine Downtime Report" screen="Machine_Downtime">
      <div className="grid">
        <ChartCard title="Chart A" raw loading={aLoading} filterText="01-11-2026 to 26-11-2026" exportData={DATA}>
          <div data-testid="plot-a">a</div>
        </ChartCard>
        <ChartCard title="Chart B" raw empty={bEmpty} exportData={DATA}>
          <div data-testid="plot-b">b</div>
        </ChartCard>
      </div>
    </ChartGroup>,
  )

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 26, 10, 0, 0))
  m.toPng.mockReset().mockImplementation(async (node) => {
    m.seenAtCapture = node.textContent
    return 'data:image/png;base64,AAA'
  })
  m.download.mockReset()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.body.style.overflow = ''
})

describe('ChartGroup', () => {
  it('one Expand all button; cards keep only their own Expand, no Export on the screen', () => {
    group()
    expect(screen.getAllByRole('button', { name: /Expand all/ })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Expand chart' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Export/ })).toBeNull()
  })

  it('Expand all shows every chart with data in one window, each with title + filter line; PNG only', () => {
    group()
    fireEvent.click(screen.getByRole('button', { name: /Expand all/ }))
    const dialog = screen.getByRole('dialog', { name: 'Machine Downtime Report – all charts' })
    const cells = within(dialog).getAllByTestId('chart-group-cell')
    expect(cells).toHaveLength(2)
    expect(within(cells[0]).getByText('Chart A')).toBeTruthy()
    expect(within(cells[0]).getByText('01-11-2026 to 26-11-2026')).toBeTruthy()
    expect(within(dialog).getByTestId('plot-b')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: /Export PNG/ })).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: /Excel/ })).toBeNull()
    expect(within(dialog).queryByRole('menuitem')).toBeNull()
  })

  it('single column at every width, each chart full width (window + PNG use the same grid)', () => {
    group()
    fireEvent.click(screen.getByRole('button', { name: /Expand all/ }))
    const grid = screen.getByTestId('chart-group-grid')
    expect(grid.className.split(/\s+/)).toContain('grid-cols-1')
    expect(grid.className).not.toMatch(/(^|\s)\w+:grid-cols-/)
    expect(screen.getByTestId('chart-group-capture').contains(grid)).toBe(true)
    for (const cell of within(grid).getAllByTestId('chart-group-cell')) {
      expect(cell.parentElement).toBe(grid)
      expect(cell.className).not.toMatch(/col-span|(^|\s)w-\d|max-w-/)
    }
  })

  it('empty charts are left out of the window', () => {
    group({ bEmpty: true })
    fireEvent.click(screen.getByRole('button', { name: /Expand all/ }))
    const cells = within(screen.getByRole('dialog')).getAllByTestId('chart-group-cell')
    expect(cells).toHaveLength(1)
    expect(within(cells[0]).getByText('Chart A')).toBeTruthy()
  })

  it('Expand all is disabled while any chart is loading', () => {
    group({ aLoading: true })
    expect(screen.getByRole('button', { name: /Expand all/ }).disabled).toBe(true)
  })

  it('Esc / Close close it and restore page scroll', () => {
    document.body.style.overflow = 'auto'
    group()
    fireEvent.click(screen.getByRole('button', { name: /Expand all/ }))
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.body.style.overflow).toBe('auto')
    fireEvent.click(screen.getByRole('button', { name: /Expand all/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Export PNG: one image with screen title, charts, filters + Exported line -> <Screen>_All_charts_<date>.png', async () => {
    group()
    fireEvent.click(screen.getByRole('button', { name: /Expand all/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Export PNG/ }))
    })
    await waitFor(() => expect(m.download).toHaveBeenCalledTimes(1))
    expect(m.download).toHaveBeenCalledWith('data:image/png;base64,AAA', 'Machine_Downtime_All_charts_2026-11-26.png')
    const [node, options] = m.toPng.mock.calls[0]
    expect(node.getAttribute('data-testid')).toBe('chart-group-capture')
    expect(options.filter).toBe(pngFilter)
    expect(m.seenAtCapture).toContain('Machine Downtime Report')
    expect(m.seenAtCapture).toContain('Chart A')
    expect(m.seenAtCapture).toContain('Chart B')
    expect(m.seenAtCapture).toContain('01-11-2026 to 26-11-2026')
    expect(m.seenAtCapture).toContain('Exported 26-11-2026')
    expect(m.seenAtCapture).not.toContain('Export PNG') // buttons are outside the captured part
  })

  it('a PNG failure shows an error and nothing is downloaded', async () => {
    m.toPng.mockRejectedValueOnce(new Error('canvas tainted'))
    group()
    fireEvent.click(screen.getByRole('button', { name: /Expand all/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Export PNG/ }))
    })
    expect((await screen.findByRole('alert')).textContent).toContain('canvas tainted')
    expect(m.download).not.toHaveBeenCalled()
  })

  it('a ChartCard outside a group still works (no Expand all)', () => {
    render(<ChartCard title="Solo" raw><div>x</div></ChartCard>)
    expect(screen.queryByRole('button', { name: /Expand all/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Expand chart' })).toBeTruthy()
  })

  it('BMLH styling only: no demo brand classes in ChartGroup', () => {
    const src = readSrc('components/reports/ChartGroup.jsx')
    // words built from parts so the repo-wide branding grep stays at 0
    const banned = ['blue', 'navy', 'sky'].map((c) => `brand${c}`).concat('bg-page')
    for (const w of banned) expect(src).not.toContain(w)
  })

  it('every report screen wraps its charts in one ChartGroup', () => {
    const names = ['Complaint', 'CustomerOrder', 'DailyMachine', 'Downtime', 'FgInventory', 'JobOrder', 'ProductionStatus', 'QualityStatus', 'RawMaterialStatus', 'WipStatus']
    for (const n of names) {
      const file = n.endsWith('Status') || n === 'DailyMachine' || n === 'Downtime' || n === 'FgInventory' ? `${n}Screen.jsx` : `${n}StatusScreen.jsx`
      const src = readSrc(`modules/reports/${file}`)
      expect(src.match(/<ChartGroup /g), file).toHaveLength(1)
      expect(src.match(/<\/ChartGroup>/g), file).toHaveLength(1)
    }
  })
})
