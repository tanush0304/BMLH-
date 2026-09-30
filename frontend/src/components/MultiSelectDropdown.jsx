import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * A dropdown checklist for picking several values from a fixed list, plus an
 * "Other" option that reveals a free-text box for a value not in the list.
 * `selected` is the full flat array of chosen values -- standard options and
 * (at most one) custom "Other" value live in the same array; this component
 * figures out which is which by checking membership in `options`.
 *
 * "Other checked" is tracked as real local state, not derived from whether a
 * custom value is present -- an empty string is indistinguishable from "no
 * custom value" when derived, so the checkbox couldn't tell "just checked,
 * nothing typed yet" apart from "unchecked" and never visibly toggled.
 */
export default function MultiSelectDropdown({ options, selected, onChange, disabled, placeholder = 'Select...' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const standardSelected = selected.filter((s) => options.includes(s))
  const customValue = selected.find((s) => !options.includes(s)) ?? ''
  const [otherChecked, setOtherChecked] = useState(customValue !== '')

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function toggleOption(opt) {
    if (standardSelected.includes(opt)) {
      onChange(selected.filter((s) => s !== opt))
    } else {
      onChange([...selected, opt])
    }
  }

  function toggleOther() {
    if (otherChecked) {
      setOtherChecked(false)
      if (customValue) onChange(selected.filter((s) => s !== customValue))
    } else {
      setOtherChecked(true)
    }
  }

  function handleOtherTextChange(text) {
    onChange(text ? [...standardSelected, text] : standardSelected)
  }

  const summary = selected.filter(Boolean).length === 0 ? placeholder : selected.filter(Boolean).join(', ')

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="w-full flex items-center justify-between gap-1 border border-gray-300 rounded px-2.5 py-1.5 text-xs bg-white text-left disabled:bg-gray-100"
      >
        <span className="truncate text-gray-700">{summary}</span>
        <ChevronDown size={12} className="shrink-0 text-gray-400" />
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-56 bg-white border border-gray-200 rounded shadow-lg max-h-56 overflow-y-auto">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={standardSelected.includes(opt)}
                onChange={() => toggleOption(opt)}
                className="rounded border-gray-300"
              />
              {opt}
            </label>
          ))}
          <label className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs hover:bg-gray-50 cursor-pointer border-t border-gray-100">
            <input type="checkbox" checked={otherChecked} onChange={toggleOther} className="rounded border-gray-300" />
            Other
          </label>
        </div>
      )}

      {otherChecked && (
        <input
          type="text"
          value={customValue}
          onChange={(e) => handleOtherTextChange(e.target.value)}
          disabled={disabled}
          placeholder="Specify..."
          className="mt-1 w-full border border-gray-300 rounded px-2.5 py-1.5 text-xs disabled:bg-gray-100"
        />
      )}
    </div>
  )
}
