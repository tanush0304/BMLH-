import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'

/**
 * A dropdown checklist for picking several values from a list, plus a
 * free-text "Add new..." box for values not in that list. Unlike the old
 * single-slot "Other" design, there is no limit on how many values outside
 * `options` can be selected at once -- any value in `selected` that isn't
 * in `options` (e.g. data saved before that value existed in the backing
 * master table, or added earlier in this same session) is still rendered
 * as its own checked row, not silently collapsed into one shared slot.
 *
 * `onAddOption`, if given, is awaited before the new value is added to
 * `selected` -- the caller's chance to persist it somewhere real (a master
 * table) before it's treated as selected. Without it, the new value is
 * just added to `selected` locally, and it's on the caller to decide what
 * to do with a value that isn't in `options` (e.g. resolve it at save
 * time, the pattern Vendor Master already used for Job Work Types).
 */
export default function MultiSelectDropdown({ options, selected, onChange, onAddOption, disabled, placeholder = 'Select...' }) {
  const [open, setOpen] = useState(false)
  const [newText, setNewText] = useState('')
  const ref = useRef(null)

  const extraSelected = selected.filter((s) => s && !options.includes(s))
  const displayOptions = [...options, ...extraSelected]

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function toggleOption(opt) {
    if (selected.includes(opt)) {
      onChange(selected.filter((s) => s !== opt))
    } else {
      onChange([...selected, opt])
    }
  }

  async function handleAddNew() {
    const text = newText.trim()
    if (!text || displayOptions.includes(text)) {
      setNewText('')
      return
    }
    if (onAddOption) await onAddOption(text)
    onChange([...selected, text])
    setNewText('')
  }

  const summary = selected.filter(Boolean).length === 0 ? placeholder : selected.filter(Boolean).join(', ')

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="input-dropdown w-full flex items-center justify-between gap-1 border rounded px-2.5 py-1.5 text-xs text-left"
      >
        <span className="truncate text-gray-700">{summary}</span>
        <ChevronDown size={12} className="shrink-0 text-gray-400" />
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-56 bg-white border border-gray-200 rounded shadow-lg">
          <div className="max-h-56 overflow-y-auto">
            {displayOptions.map((opt) => (
              <label key={opt} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggleOption(opt)}
                  className="rounded border-gray-300"
                />
                {opt}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-1 px-2 py-1.5 border-t border-gray-100">
            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddNew()
                }
              }}
              placeholder="Add new..."
              className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-bmlhblue/30"
            />
            <button
              type="button"
              onClick={handleAddNew}
              className="shrink-0 inline-flex items-center gap-0.5 text-bmlhblue hover:underline text-xs font-medium px-1"
            >
              <Plus size={12} /> Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
