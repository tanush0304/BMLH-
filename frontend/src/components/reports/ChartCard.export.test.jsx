// @vitest-environment jsdom
// ChartCard Expand + Export (PNG / Excel), ported from the demo and adapted:
// the card itself shows only Expand; Export ▾ lives in the Expand modal's
// header next to ✕. html-to-image, the CSV export and the download are
// mocked -- nothing is drawn to a canvas, saved or fetched.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const m = vi.hoisted(() => ({ toPng: vi.fn(), exportToCsv: vi.fn(), download: vi.fn(), seenAtCapture: null }))
vi.mock('html-to-image', () => ({ toPng: (...a) => m.toPng(...a) }))
vi.mock('../../utils/exportUtils', () => ({ exportToCsv: (...a) => m.exportToCsv(...a) }))
vi.mock('../../utils/chartExport', async (orig) => ({ ...(await orig()), downloadDataUrl: (...a) => m.download(...a) }))

const { default: ChartCard } = await import('./ChartCard')
const { pngFilter, chartFileName, reportFilterText, fieldsFilterText, donutExportData, seriesExportData, fileNamePart } = await import('../../utils/chartExport')

const DATA = {
  columns: [
    { key: 'machine_name', label: 'Machine' },
    { key: 'efficiency_pct', label: 'Efficiency %' },
  ],
  rows: [
    { machine_name: 'Cuttng Mc 1', efficiency_pct: 92.5 },
    { machine_name: 'VMC 3', efficiency_pct: 81 },
  ],
}
const PROPS = {
  title: 'Production Efficiency (By Machine)',
  screen: 'Production_Status',
  exportKey: 'Efficiency_By_Machine',
  exportData: DATA,
  filterText: '01-04-2026 to 15-11-2026 · Machine: Cuttng Mc 1 (MC-001)',
  raw: true,
}
const card = (props = {}) => render(<ChartCard {...PROPS} {...props}><div data-testid="plot">plot</div></ChartCard>)
const openModal = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Expand chart' }))
  return screen.getByRole('dialog', { name: PROPS.title })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 15, 10, 0, 0)) // 15-11-2026 local
  m.toPng.mockReset().mockImplementation(async (node) => {
    m.seenAtCapture = node.textContent
    return 'data:image/png;base64,AAA'
  })
  m.exportToCsv.mockReset()
  m.download.mockReset()
  m.seenAtCapture = null
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.body.style.overflow = ''
})

describe('card', () => {
  it('shows only Expand -- no Export button on the card', () => {
    card()
    expect(screen.getByRole('button', { name: 'Expand chart' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Export/ })).toBeNull()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it.each([
    ['loading', { loading: true }],
    ['empty', { empty: true }],
  ])('%s: Expand is disabled, so the modal (and Export) cannot open', (_, extra) => {
    card(extra)
    const expand = screen.getByRole('button', { name: 'Expand chart' })
    expect(expand.disabled).toBe(true)
    fireEvent.click(expand)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: /Export/ })).toBeNull()
  })

  it('coloured header bar (Daily Machine) also gets Expand only', () => {
    card({ headerColor: '#1E7BF2' })
    expect(screen.getByRole('button', { name: 'Expand chart' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Export/ })).toBeNull()
  })
})

describe('Expand modal', () => {
  it('opens at ~90% of the viewport above everything, with the same title, filter line and chart', () => {
    card()
    const dialog = openModal()
    expect(dialog.className).toContain('sm:h-[90vh]')
    expect(dialog.className).toContain('sm:w-[90vw]')
    expect(dialog.className).toContain('h-full w-full') // full screen on phones
    expect(screen.getByTestId('chart-modal-backdrop').className).toContain('z-[70]')
    expect(within(dialog).getByText(PROPS.filterText)).toBeTruthy()
    expect(within(dialog).getByTestId('plot')).toBeTruthy() // re-rendered, not a scaled copy
    expect(screen.getAllByTestId('plot')).toHaveLength(2)
  })

  it('Export sits in the modal header next to ✕', () => {
    card()
    const dialog = openModal()
    const exportBtn = within(dialog).getByRole('button', { name: /Export/ })
    const close = within(dialog).getByRole('button', { name: 'Close' })
    expect(exportBtn.closest('div.flex.items-start')).toBe(close.parentElement)
  })

  it('locks page scroll while open and restores it on close', () => {
    document.body.style.overflow = 'auto'
    card()
    openModal()
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.body.style.overflow).toBe('auto')
  })

  it('Esc closes it', () => {
    card()
    openModal()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a click outside (backdrop) closes it; a click inside does not', () => {
    card()
    openModal()
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.mouseDown(screen.getByTestId('chart-modal-backdrop'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('without exportData the modal has no Export', () => {
    card({ exportData: undefined })
    const dialog = openModal()
    expect(within(dialog).queryByRole('button', { name: /Export/ })).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeTruthy()
  })
})

describe('Export (inside the modal)', () => {
  it('menu: PNG and Excel, styled like the table Export button', () => {
    card()
    const dialog = openModal()
    const btn = within(dialog).getByRole('button', { name: /Export/ })
    expect(btn.className).toContain('bg-[#1F8A3B]') // ReportTable's Export
    fireEvent.click(btn)
    const menu = screen.getByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['PNG', 'Excel'])
  })

  it('Excel: exportToCsv with the chart columns + rows and <Screen>_<Chart>_<YYYY-MM-DD>.csv', () => {
    card()
    openModal()
    fireEvent.click(screen.getByRole('button', { name: /Export/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excel' }))
    expect(m.exportToCsv).toHaveBeenCalledTimes(1)
    expect(m.exportToCsv).toHaveBeenCalledWith(DATA.columns, DATA.rows, 'Production_Status_Efficiency_By_Machine_2026-11-15.csv')
  })

  it('PNG: captures the enlarged chart with title, filter line and export date, then downloads <Screen>_<Chart>_<date>.png', async () => {
    card()
    const dialog = openModal()
    fireEvent.click(screen.getByRole('button', { name: /Export/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'PNG' }))
    })
    await waitFor(() => expect(m.download).toHaveBeenCalledTimes(1))
    expect(m.download).toHaveBeenCalledWith('data:image/png;base64,AAA', 'Production_Status_Efficiency_By_Machine_2026-11-15.png')
    const [node, options] = m.toPng.mock.calls[0]
    expect(node).toBe(dialog) // the enlarged chart, not the small card or the page
    expect(options.filter).toBe(pngFilter)
    expect(m.seenAtCapture).toContain(PROPS.title)
    expect(m.seenAtCapture).toContain(PROPS.filterText)
    expect(m.seenAtCapture).toContain('Exported 15-11-2026')
    expect(screen.queryByText(/Exported 15-11-2026/)).toBeNull() // only shown while capturing
  })

  it('PNG leaves out ✕, Export and the open menu (toPng filter)', async () => {
    card()
    const dialog = openModal()
    fireEvent.click(within(dialog).getByRole('button', { name: /Export/ }))
    const menu = screen.getByRole('menu')
    const exportBtn = within(dialog).getByRole('button', { name: /Export/ })
    const close = within(dialog).getByRole('button', { name: 'Close' })
    const exportWrap = exportBtn.closest('[data-export-exclude]')
    expect(exportWrap).toBeTruthy()
    expect(exportWrap.contains(menu)).toBe(true)
    expect(pngFilter(exportWrap)).toBe(false)
    expect(pngFilter(close)).toBe(false)
    expect(pngFilter(within(dialog).getByRole('heading', { name: PROPS.title }))).toBe(true)
    expect(pngFilter(within(dialog).getByTestId('plot'))).toBe(true)
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'PNG' }))
    })
    await waitFor(() => expect(m.toPng).toHaveBeenCalled())
    expect(m.toPng.mock.calls[0][1].filter).toBe(pngFilter)
  })

  it('a PNG failure shows an error and nothing is downloaded', async () => {
    m.toPng.mockRejectedValueOnce(new Error('canvas tainted'))
    card()
    openModal()
    fireEvent.click(screen.getByRole('button', { name: /Export/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'PNG' }))
    })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('canvas tainted')
    expect(m.download).not.toHaveBeenCalled()
  })
})

describe('chartExport helpers', () => {
  it('file name parts and pattern', () => {
    expect(fileNamePart('Efficiency (By Machine)')).toBe('Efficiency_By_Machine')
    expect(chartFileName('Machine_Downtime', 'Downtime % by Type', new Date(2026, 0, 5))).toBe('Machine_Downtime_Downtime_by_Type_2026-01-05')
  })

  it('filter line: applied range + filters by label, blanks left out', () => {
    const applied = { from: '2026-04-01', to: '2026-11-15', machineId: 'MC-001', shiftCode: '' }
    expect(
      reportFilterText(applied, [
        { label: 'Machine', key: 'machineId', options: [{ value: 'MC-001', label: 'Cuttng Mc 1 (MC-001)' }] },
        { label: 'Shift', key: 'shiftCode' },
      ]),
    ).toBe('01-04-2026 to 15-11-2026 · Machine: Cuttng Mc 1 (MC-001)')
  })

  it('fieldsFilterText reads the filter bar fields through the key map', () => {
    const applied = { from: '2026-11-01', to: '2026-11-15', prdNo: 'PRD-012', shiftCode: '' }
    const fields = [
      { key: 'prd', label: 'PRD No', options: ['PRD-012'] },
      { key: 'shift', label: 'Shift', options: ['SHIFT-A'] },
      { key: 'other', label: 'Not mapped', options: [] },
    ]
    expect(fieldsFilterText(applied, fields, { prd: 'prdNo', shift: 'shiftCode' })).toBe('01-11-2026 to 15-11-2026 · PRD No: PRD-012')
  })

  it('donut + series export data use the chart labels', () => {
    expect(donutExportData([{ label: 'Closed', value: 3 }, { label: 'Open', value: 1 }], { labelHeader: 'Status', valueHeader: 'Qty' })).toEqual({
      columns: [{ key: 'label', label: 'Status' }, { key: 'value', label: 'Qty' }, { key: 'share', label: 'Share %' }],
      rows: [{ label: 'Closed', value: 3, share: 75 }, { label: 'Open', value: 1, share: 25 }],
    })
    expect(seriesExportData([{ label: 'Oct', po: 5, extra: 1 }], 'label', 'Month', [{ key: 'po', label: 'PO Quantity' }])).toEqual({
      columns: [{ key: 'label', label: 'Month' }, { key: 'po', label: 'PO Quantity' }],
      rows: [{ label: 'Oct', po: 5 }],
    })
  })
})
