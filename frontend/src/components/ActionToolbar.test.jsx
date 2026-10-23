// @vitest-environment jsdom
import { createElement } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ActionToolbar from './ActionToolbar'

function openPrint(extra = {}) {
  const onExportExcel = vi.fn()
  const onExportPdf = vi.fn()
  render(createElement(ActionToolbar, { onExportExcel, onExportPdf, ...extra }))
  fireEvent.click(screen.getByRole('button', { name: /Print/ }))
  return { onExportExcel, onExportPdf }
}

function clickItem(name) {
  const item = screen.getByRole('menuitem', { name })
  fireEvent.mouseDown(item)
  fireEvent.click(item)
}

afterEach(cleanup)

describe('ActionToolbar Print menu', () => {
  it('Excel calls onExportExcel, then closes', () => {
    const { onExportExcel, onExportPdf } = openPrint()
    clickItem('Excel')
    expect(onExportExcel).toHaveBeenCalledTimes(1)
    expect(onExportPdf).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('PDF calls onExportPdf, then closes', () => {
    const { onExportPdf } = openPrint()
    clickItem('PDF')
    expect(onExportPdf).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes on a mousedown outside, without exporting', () => {
    const { onExportExcel } = openPrint()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(onExportExcel).not.toHaveBeenCalled()
  })

  it('closes on Escape and returns focus to the Print button', () => {
    openPrint()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Print/ }))
  })

  it('Print is disabled when the screen opts out of export', () => {
    render(createElement(ActionToolbar, { showExport: false }))
    expect(screen.getByRole('button', { name: /Print/ }).disabled).toBe(true)
  })
})
