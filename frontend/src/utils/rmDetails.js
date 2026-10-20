// Read-only Raw Material Master details shown on the RM Receipt (GRN) form,
// list and export (field audit): type, category, UoM, source and a
// description = material name + its dimensions.

const num = (v) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim())

/** "Ø90 mm × L 6 m × W 20 mm × T 5 mm" from the filled dimension columns. */
export function rmDimensions(rm) {
  if (!rm) return ''
  const parts = []
  if (num(rm.diameter_mm)) parts.push(`Ø${num(rm.diameter_mm)} mm`)
  if (num(rm.length_mtrs)) parts.push(`L ${num(rm.length_mtrs)} m`)
  if (num(rm.width)) parts.push(`W ${num(rm.width)} mm`)
  if (num(rm.thickness)) parts.push(`T ${num(rm.thickness)} mm`)
  return parts.join(' × ')
}

/** Display fields for one RM Master row ('' for each when not found). */
export function rmDetails(rm) {
  if (!rm) return { rm_type: '', rm_category: '', rm_uom: '', rm_source: '', rm_description: '' }
  const name = rm.raw_material_name || rm.raw_material_code || ''
  const dims = rmDimensions(rm)
  return {
    rm_type: rm.rm_type ?? '',
    rm_category: rm.raw_material_category ?? '',
    rm_uom: rm.unit_of_measurement ?? '',
    rm_source: rm.rm_source ?? '',
    rm_description: dims ? `${name} – ${dims}` : name,
  }
}
