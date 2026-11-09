// Raw material display helpers: "Grade · Ø<dia>" from "raw materials
// master".grade (041) + diameter_mm. Display only -- values saved stay the
// RM code.

function formatDia(value) {
  if (value === null || value === undefined || String(value).trim() === '') return ''
  const n = Number(value)
  return Number.isFinite(n) ? String(n) : String(value).trim()
}

/** "SCM415H · Ø50", "SCM415H", "Ø50" or '' when neither is set. */
export function rmSpec(rm) {
  if (!rm) return ''
  const grade = (rm.grade ?? '').toString().trim()
  const dia = formatDia(rm.diameter_mm)
  return [grade, dia ? `Ø${dia}` : ''].filter(Boolean).join(' · ')
}

/** Appends " (spec)" to a base label when the RM has a grade or dia. */
export function withRmSpec(label, rm) {
  const spec = rmSpec(rm)
  return spec ? `${label} (${spec})` : label
}

/** Standard dropdown label: "CODE – Name (Grade · ØDia)". */
export function rmOptionLabel(rm, sep = ' – ') {
  if (!rm) return ''
  const base = rm.raw_material_name ? `${rm.raw_material_code}${sep}${rm.raw_material_name}` : rm.raw_material_code
  return withRmSpec(base, rm)
}
