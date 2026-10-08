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
    <section className="rounded-2xl border border-[#CFE2F8] bg-white shadow-[0_2px_8px_rgba(16,60,120,0.06)]">
      {/* Rounding lives on the header itself (not overflow-hidden on the
          card) so a child dropdown's popup panel -- e.g. MultiSelectDropdown,
          absolutely positioned inside this card -- can render past the
          card's own edge instead of being clipped by it. */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-t-2xl border-b border-[#CFE2F8] bg-[#E3F0FD] px-4 py-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1669E0] text-[12px] font-bold text-white">
          {number}
        </span>
        {Icon && <Icon size={16} strokeWidth={2.2} className="shrink-0 text-[#1669E0]" />}
        <h2 className="min-w-0 truncate text-[15px] font-semibold text-[#0A4CB0]">{displayTitle}</h2>
        {subtitle && (
          <span className="ml-auto truncate pl-2 text-[12px] font-normal text-slate-500">{subtitle}</span>
        )}
        {number === '1' && (
          <span className={`card-legend ${subtitle ? 'pl-3' : 'ml-auto'}`}>
            <FieldLegend />
          </span>
        )}
      </div>
      <div className="form-card-body flex flex-wrap items-start gap-x-3 gap-y-2 p-3">{children}</div>
    </section>
  )
}

// Colour key for the input colour coding (see index.css). Shown once per
// form: left of the toolbar's Print button, or -- on screens without a
// toolbar -- in the header of the first section card.
export function FieldLegend() {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] font-normal text-slate-600" aria-label="Field colour key">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-5 rounded border border-[#E5C65A] bg-[#FFF6CC]" aria-hidden="true" />
        Dropdown
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-5 rounded border border-[#A9C8EE] bg-[#EAF2FD]" aria-hidden="true" />
        Manual entry
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-5 rounded border border-[#EFC6A8] bg-[#FDEFE6]" aria-hidden="true" />
        Auto-filled
      </span>
    </span>
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

// Auto-filled = explicitly readOnly, or always-disabled with no onChange
// (how screens render values pulled from masters / calculated). Fields that
// are only locked in view/edit mode keep their onChange, so they stay
// "manual entry" and render neutral while locked.
export function TextInput(props) {
  const auto = Boolean(props.readOnly) || (Boolean(props.disabled) && !props.onChange)
  return (
    <input
      {...props}
      type={props.type ?? 'text'}
      className={`w-full rounded border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-bmlhblue/30 ${auto ? 'input-auto' : 'input-manual'}`}
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
      className="input-dropdown w-full rounded border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-bmlhblue/30"
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
    <div className="input-auto flex overflow-hidden rounded border">
      <div className="flex-1 truncate px-2.5 py-1.5 text-xs">{value ?? ''}</div>
      {unit && (
        <div className="shrink-0 border-l border-[#EFC6A8] bg-[#F9E2D2] px-2.5 py-1.5 text-xs text-[#8A5A36]">
          {unit}
        </div>
      )}
    </div>
  )
}
