import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { filterOptions, keyAction, normalizeOptions } from '../utils/searchableSelect'

/**
 * Drop-in replacement for SelectInput on long / data-driven lists: click to
 * open, type to filter (anywhere in code or name, case-insensitive), arrow
 * keys + Enter to pick, Esc to close, Tab moves on, x clears.
 *
 * Same contract as SelectInput: `value` in, `onChange({ target: { value } })`
 * out, value always a string (as a native <select> reports it), '' when
 * cleared. Only existing options can be picked -- typed text is a filter,
 * never a value. Keeps the yellow "dropdown" colour (input-dropdown).
 */
export default function SearchableSelect({
  options = [],
  value,
  onChange,
  disabled = false,
  placeholder = 'Select...',
  name,
  id,
  required,
  'aria-label': ariaLabel,
}) {
  const normalized = useMemo(() => normalizeOptions(options), [options])
  const selected = normalized.find((o) => o.value === String(value ?? '')) ?? null

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(-1)
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const listId = useId()

  const filtered = useMemo(() => filterOptions(normalized, query), [normalized, query])

  function close() {
    setOpen(false)
    setQuery('')
    setHighlight(-1)
  }

  function openList() {
    if (disabled) return
    setOpen(true)
    // Start on the current value so ↓/Enter continue from there.
    const idx = normalized.findIndex((o) => o.value === selected?.value)
    setHighlight(idx)
  }

  function pick(option) {
    close()
    if (option.value !== String(value ?? '')) onChange?.({ target: { value: option.value, name } })
  }

  // Close when clicking anywhere outside the control.
  useEffect(() => {
    if (!open) return undefined
    function onDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    if (!open || highlight < 0) return
    listRef.current?.children[highlight]?.scrollIntoView?.({ block: 'nearest' })
  }, [open, highlight])

  function handleKeyDown(e) {
    const result = keyAction(e.key, { open, highlight }, filtered)
    if (result.preventDefault) e.preventDefault()
    if (result.pick) {
      pick(result.pick)
      return
    }
    if (!result.open && open) close()
    else {
      setOpen(result.open)
      setHighlight(result.highlight)
    }
  }

  function handleInput(e) {
    setQuery(e.target.value)
    setOpen(true)
    setHighlight(0)
  }

  // Inside a <label> (Field), a click's default action re-clicks the input;
  // preventDefault stops that so picking/clearing doesn't reopen the list.
  function stopLabel(e) {
    e.preventDefault()
  }

  const showClear = Boolean(selected) && !disabled

  return (
    <div ref={rootRef} className="relative w-full">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-required={required || undefined}
        aria-activedescendant={open && highlight >= 0 ? `${listId}-${highlight}` : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={selected ? selected.label : placeholder}
        value={open ? query : (selected?.label ?? '')}
        onChange={handleInput}
        onClick={() => !open && openList()}
        onKeyDown={handleKeyDown}
        className={`input-dropdown w-full rounded border py-1.5 pl-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-bmlhblue/30 ${
          showClear ? 'pr-12' : 'pr-7'
        }`}
      />
      <div className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center gap-0.5">
        {showClear && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Clear selection"
            className="pointer-events-auto rounded p-0.5 text-slate-500 hover:bg-black/5 hover:text-slate-700"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              stopLabel(e)
              close()
              onChange?.({ target: { value: '', name } })
              inputRef.current?.focus()
            }}
          >
            <X size={13} />
          </button>
        )}
        <ChevronDown size={14} className="text-slate-500" />
      </div>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-60 overflow-y-auto rounded border border-[#E5C65A] bg-white py-1 text-xs shadow-lg"
        >
          {filtered.length === 0 && <li className="px-2.5 py-1.5 text-slate-400">No matches</li>}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === selected?.value}
              className={`cursor-pointer px-2.5 py-1.5 ${i === highlight ? 'bg-[#FFF0B3]' : ''} ${
                o.value === selected?.value ? 'font-semibold text-slate-900' : 'text-slate-700'
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(i)}
              onClick={(e) => {
                stopLabel(e)
                pick(o)
              }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
