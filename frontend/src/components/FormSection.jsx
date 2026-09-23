export default function FormSection({ icon: Icon, title, columns = 3, children }) {
  const colClass = { 1: 'grid-cols-1', 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' }[
    columns
  ] ?? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'

  return (
    <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="flex items-center gap-2 bg-bmlhsky border-b border-gray-200 px-4 py-2.5">
        {Icon && <Icon size={16} className="text-bmlhnavy" />}
        <h2 className="text-sm font-semibold text-bmlhnavy">{title}</h2>
      </div>
      <div className={`grid ${colClass} gap-x-4 gap-y-3.5 p-5`}>{children}</div>
    </div>
  )
}

export function Field({ label, required, className = '', children }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
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
      className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bmlhblue/30 disabled:bg-gray-100"
    />
  )
}

export function SelectInput({ options = [], ...props }) {
  return (
    <select
      {...props}
      className="border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-bmlhblue/30 disabled:bg-gray-100"
    >
      <option value="">Select...</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  )
}
