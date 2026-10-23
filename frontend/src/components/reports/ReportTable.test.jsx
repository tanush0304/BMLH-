// @vitest-environment jsdom
import { createElement } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Export ▾ used to close on mouse-leave, so moving from the button to an item
// closed the menu before the click and nothing downloaded.
vi.mock('../../utils/exportUtils', () => ({ exportToCsv: vi.fn(), exportToPdf: vi.fn() }))
import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import ReportTable from './ReportTable'

const props = {
  title: 'Detail',
  columns: [{ key: 'name', label: 'Name' }],
  rows: [{ name: 'A' }, { name: 'B' }],
  exportTitle: 'Detail Report',
  exportName: 'detail_report',
}

function openMenu() {
  render(createElement(ReportTable, props))
  fireEvent.click(screen.getByRole('button', { name: /Export/ }))
  return screen.getByRole('menu')
}

// A real click: mousedown, then click, on the item.
function clickItem(name) {
  const item = screen.getByRole('menuitem', { name })
  fireEvent.mouseDown(item)
  fireEvent.click(item)
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ReportTable Export menu', () => {
  it('Excel calls exportToCsv with the rows, then closes', () => {
    openMenu()
    clickItem('Excel')
    expect(exportToCsv).toHaveBeenCalledTimes(1)
    expect(exportToCsv.mock.calls[0][1]).toHaveLength(2)
    expect(exportToCsv.mock.calls[0][2]).toBe('detail_report.csv')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('PDF calls exportToPdf, then closes', () => {
    openMenu()
    clickItem('PDF')
    expect(exportToPdf).toHaveBeenCalledTimes(1)
    expect(exportToPdf.mock.calls[0][2]).toBe('Detail Report')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('stays open when the mouse leaves the button on the way to an item', () => {
    const menu = openMenu()
    fireEvent.mouseLeave(menu.parentElement)
    fireEvent.mouseOut(screen.getByRole('button', { name: /Export/ }))
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('closes on a mousedown outside, without exporting', () => {
    openMenu()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(exportToCsv).not.toHaveBeenCalled()
  })

  it('closes on Escape and returns focus to the Export button', () => {
    openMenu()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Export/ }))
  })
})
