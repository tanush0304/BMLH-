// `columns` is accepted but no longer drives layout -- kept so existing call
// sites don't need touching. Fields lay out with flex-wrap: everything sits
// on one row, each field sized to its own width tier (see Field's `width`
// prop) rather than a fixed column split, and only wraps to a second line
// if it genuinely doesn't fit at the current viewport width.
export default function FormSection({ icon: Icon, title, columns, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="flex items-center gap-1.5 bg-bmlhsky border-b border-gray-200 px-3 py-1">
        {Icon && <Icon size={13} className="text-bmlhnavy" />}
        <h2 className="text-xs font-semibold text-bmlhnavy">{title}</h2>
      </div>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 p-2.5">{children}</div>
    </div>
  )
}

// Width tiers replace the old fixed 50%/33% grid columns -- pick the tier
// that matches the field's own content, not to force equal widths. 'long'
// grows to fill leftover row space (an Address next to short fields), so
// only one 'long' field per row reads well; use 'medium' for more than one
// wide-ish field on the same row.
const WIDTH_CLASS = {
  tiny: 'w-24',
  short: 'w-28',
  medium: 'w-48',
  long: 'flex-1 min-w-[220px]',
}

export function Field({ label, required, width = 'medium', className = '', children }) {
  return (
    <label className={`flex flex-col gap-0.5 text-xs ${WIDTH_CLASS[width] ?? WIDTH_CLASS.medium} ${className}`}>
      <span className="text-gray-700 min-h-[32px] flex items-end">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  )
}

export function TextInput(props) {
  return (
    <input
      {...props}
      type={props.type ?? 'text'}
      className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-bmlhblue/30 disabled:bg-gray-100"
    />
  )
}

/** options: string[] or {value, label}[] -- the latter lets a dropdown show a
 * friendly name while submitting the underlying code/id as the value. */
export function SelectInput({ options = [], ...props }) {
  const normalized = options.map((opt) =>
    typeof opt === 'object' && opt !== null ? opt : { value: opt, label: opt }
  )
  return (
    <select
      {...props}
      className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-bmlhblue/30 disabled:bg-gray-100"
    >
      <option value="">Select...</option>
      {normalized.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

/** A visually-disabled "field box" for auto-filled values that aren't a real
 * <input>, with an optional trailing unit label (e.g. "Nos") matching the
 * Stores mockups. */
export function AutoFillBox({ value, unit }) {
  return (
    <div className="flex rounded border border-gray-300 overflow-hidden bg-gray-100">
      <div className="flex-1 px-2.5 py-1.5 text-xs text-gray-700 truncate">{value ?? ''}</div>
      {unit && (
        <div className="px-2.5 py-1.5 text-xs text-gray-500 bg-gray-200 border-l border-gray-300 shrink-0">
          {unit}
        </div>
      )}
    </div>
  )
}
