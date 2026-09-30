// `columns` is accepted but no longer drives layout -- kept so existing call
// sites don't need touching. Fields lay out with flex-wrap: everything sits
// on one row, each field sized to its own width tier (see Field's `width`
// prop) rather than a fixed column split, and only wraps to a second line
// if it genuinely doesn't fit at the current viewport width.
//
// The numbered badge is parsed off an existing "N. Title" convention already
// used everywhere (so call sites don't need a separate number prop) -- title
// text after the number is what's actually displayed, the digit moves into
// the badge instead of staying inline. A title with no leading number (a
// screen with only one section) just gets badge "1". Badge color is fixed
// (bmlhblue) for every section -- the only thing that varies section to
// section is the subtitle text and the icon.
export default function FormSection({ icon: Icon, title, subtitle, columns, children }) {
  const match = /^(\d+)\.\s*(.*)$/.exec(title)
  const number = match ? match[1] : '1'
  const displayTitle = match ? match[2] : title

  return (
    <div className="bg-white border border-gray-200 rounded-md">
      {/* Rounding lives on the header itself (not overflow-hidden on the
          card) so a child dropdown's popup panel -- e.g. MultiSelectDropdown,
          absolutely positioned inside this card -- can render past the
          card's own edge instead of being clipped by it. */}
      <div className="flex items-center gap-2 bg-bmlhsky border-b border-gray-200 px-3 py-1 rounded-t-md">
        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-bmlhblue text-white text-[9px] font-bold shrink-0">
          {number}
        </span>
        {Icon && <Icon size={12} className="text-bmlhnavy shrink-0" />}
        <h2 className="text-[11px] font-semibold text-bmlhnavy truncate">{displayTitle}</h2>
        {subtitle && (
          <span className="ml-auto pl-2 text-[10px] text-gray-500 font-normal whitespace-nowrap truncate">
            {subtitle}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5 p-2">{children}</div>
    </div>
  )
}

// Width tiers replace the old fixed 50%/33% grid columns -- pick the tier
// that matches the field's own content, not to force equal widths. Every
// tier now both starts at its own basis AND grows (flex-grow > 0), so a
// row of fields always reaches the card's right edge instead of leaving
// dead space after the last one -- the grow ratio scales with the basis
// so a 'long' field still ends up visibly wider than a 'tiny' one sharing
// its row, not just an equal split.
const WIDTH_CLASS = {
  tiny: 'flex-[1_0_96px]',
  short: 'flex-[1.5_0_112px]',
  medium: 'flex-[2.5_0_192px]',
  long: 'flex-[4_0_220px]',
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
