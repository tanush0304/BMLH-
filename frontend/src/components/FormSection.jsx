export default function FormSection({ icon: Icon, title, columns = 3, children }) {
  const colClass = { 1: 'grid-cols-1', 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' }[
    columns
  ] ?? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'

  return (
    <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="flex items-center gap-1.5 bg-bmlhsky border-b border-gray-200 px-3 py-1">
        {Icon && <Icon size={13} className="text-bmlhnavy" />}
        <h2 className="text-xs font-semibold text-bmlhnavy">{title}</h2>
      </div>
      <div className={`grid ${colClass} gap-x-2.5 gap-y-2 p-2.5`}>{children}</div>
    </div>
  )
}

export function Field({ label, required, className = '', children }) {
  return (
    <label className={`flex flex-col gap-0.5 text-xs ${className}`}>
      <span className="text-gray-700">
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
      className="border border-gray-300 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-bmlhblue/30 disabled:bg-gray-100"
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
      className="border border-gray-300 rounded px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-bmlhblue/30 disabled:bg-gray-100"
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
