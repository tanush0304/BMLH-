import { useState } from 'react'
import { SelectInput, TextInput } from './FormSection'

export const ADD_NEW_VALUE = '__new__'

/** Built-in options + every distinct non-empty value already saved in that
 * column (so a value added by anyone shows up for everyone), keeping the
 * built-in order first. */
export function mergeOptions(builtIn, savedValues) {
  const seen = new Set(builtIn)
  const extra = []
  for (const v of savedValues) {
    const s = typeof v === 'string' ? v.trim() : v
    if (s && !seen.has(s)) {
      seen.add(s)
      extra.push(s)
    }
  }
  return [...builtIn, ...extra.sort((a, b) => String(a).localeCompare(String(b)))]
}

/** Dropdown with a trailing "+ Add new…" option that swaps to a text box --
 * the same pattern as the "+ Add New Part..." picker on Customer Enquiry /
 * Order. The typed value is simply the field's value; it's saved on the
 * record like any other selection. */
export default function SelectWithAddNew({ value, onChange, options, disabled, placeholder = 'Type new value' }) {
  const [adding, setAdding] = useState(false)
  const showText = adding && !disabled

  if (showText) {
    return (
      <div className="flex items-center gap-2">
        <TextInput value={value} onChange={onChange} placeholder={placeholder} autoFocus />
        <button
          type="button"
          onClick={() => {
            setAdding(false)
            onChange({ target: { value: '' } })
          }}
          className="shrink-0 text-xs text-bmlhblue hover:underline"
        >
          Pick existing
        </button>
      </div>
    )
  }

  const list = value && !options.includes(value) ? [...options, value] : options
  return (
    <SelectInput
      value={value}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value === ADD_NEW_VALUE) {
          setAdding(true)
          onChange({ target: { value: '' } })
          return
        }
        onChange(e)
      }}
      options={[...list, { value: ADD_NEW_VALUE, label: '+ Add new…' }]}
    />
  )
}
