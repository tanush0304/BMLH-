// @vitest-environment jsdom
import { createElement } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SearchableSelect from './SearchableSelect'
import MultiSelectDropdown from './MultiSelectDropdown'
import { floatingListStyle } from './useFloatingList'

const OPTIONS = [
  { value: 'SUP-001', label: 'CNG Lubritools (SUP-001)' },
  { value: 'SUP-002', label: 'Steel Mart (SUP-002)' },
  { value: 'SUP-003', label: 'Alloy House (SUP-003)' },
]

function rectAt(top, { left = 20, width = 150, height = 30 } = {}) {
  return { top, bottom: top + height, left, right: left + width, width, height, x: left, y: top, toJSON() {} }
}

// Mimic the RM Master section card: overflow-hidden wrapper.
function renderInCard(props = {}, anchorTop = 100) {
  const onChange = vi.fn()
  const utils = render(
    createElement(
      'div',
      { className: 'overflow-hidden', 'data-testid': 'card' },
      createElement(SearchableSelect, { options: OPTIONS, onChange, 'aria-label': 'Supplier', ...props }),
    ),
  )
  const input = screen.getByRole('combobox', { name: 'Supplier' })
  input.parentElement.getBoundingClientRect = () => rectAt(anchorTop)
  return { ...utils, input, onChange }
}

afterEach(() => cleanup())

describe('floatingListStyle', () => {
  it('opens below with width = anchor (min 200) and caps height at 260', () => {
    const { style, up } = floatingListStyle(rectAt(100, { width: 320 }), 900)
    expect(up).toBe(false)
    expect(style).toMatchObject({ position: 'fixed', top: 134, left: 20, width: 320, maxHeight: 260 })
    expect(floatingListStyle(rectAt(100, { width: 120 }), 900).style.width).toBe(200)
  })

  it('flips upward near the bottom of the viewport', () => {
    const { style, up } = floatingListStyle(rectAt(800), 900)
    expect(up).toBe(true)
    expect(style.bottom).toBe(900 - 800 + 4)
    expect(style.top).toBeUndefined()
  })
})

describe('SearchableSelect portal list', () => {
  it('renders the list in document.body, outside the clipping card, fixed + z-[70]', () => {
    const { input, getByTestId } = renderInCard()
    fireEvent.click(input)
    const list = screen.getByRole('listbox')
    expect(getByTestId('card').contains(list)).toBe(false)
    expect(list.parentElement).toBe(document.body)
    expect(list.style.position).toBe('fixed')
    expect(list.className).toContain('z-[70]')
    expect(list.dataset.placement).toBe('bottom')
  })

  it('flips upward when the input is near the bottom', () => {
    window.innerHeight = 768
    const { input } = renderInCard({}, 700)
    fireEvent.click(input)
    expect(screen.getByRole('listbox').dataset.placement).toBe('top')
  })

  it('closes on outside click but not on a click inside the portalled list', () => {
    const { input } = renderInCard()
    fireEvent.click(input)
    fireEvent.mouseDown(screen.getByRole('listbox'))
    expect(screen.queryByRole('listbox')).not.toBeNull()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('picks with the mouse and with the keyboard; Escape closes', () => {
    const { input, onChange } = renderInCard()
    fireEvent.click(input)
    fireEvent.click(screen.getByRole('option', { name: 'Steel Mart (SUP-002)' }))
    expect(onChange).toHaveBeenLastCalledWith({ target: { value: 'SUP-002', name: undefined } })
    expect(screen.queryByRole('listbox')).toBeNull()

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getByRole('listbox')).not.toBeNull()
    fireEvent.change(input, { target: { value: 'alloy' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith({ target: { value: 'SUP-003', name: undefined } })

    fireEvent.click(input)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

describe('MultiSelectDropdown portal panel', () => {
  it('renders in body, toggles options and closes on outside click / Escape', () => {
    const onChange = vi.fn()
    render(
      createElement(
        'div',
        { className: 'overflow-hidden', 'data-testid': 'card' },
        createElement(MultiSelectDropdown, { options: ['Turning', 'Milling'], selected: [], onChange }),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: /Select/ }))
    const box = screen.getByRole('checkbox', { name: 'Milling' })
    expect(screen.getByTestId('card').contains(box)).toBe(false)
    fireEvent.mouseDown(box)
    fireEvent.click(box)
    expect(onChange).toHaveBeenCalledWith(['Milling'])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Select/ }))
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})
