import { supabase } from '../../lib/supabaseClient'
import { isMissingColumnError } from './openPo'

const TABLE = 'quality master'

export async function listQualityParameters() {
  const { data, error } = await supabase.from(TABLE).select('*').order('part_serial_number')
  if (error) throw error
  return data
}

export async function createQualityParameter(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateQualityParameter(id, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteQualityParameter(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}

// Migration 044 (Quality Master by machine category). Until it is run the
// table has no machine_category column: the form keeps "Machine" required and
// matching ignores categories. Cached once known; a network error is not
// cached. Before 044 the probe shows one expected 400 in the browser console.
let categorySupported = null
let categoryProbe = null

export async function qualityCategorySupported() {
  if (categorySupported !== null) return categorySupported
  categoryProbe ??= (async () => {
    let error
    try {
      ;({ error } = await supabase.from(TABLE).select('machine_category').limit(0))
    } catch {
      return false
    }
    if (!error) return (categorySupported = true)
    if (isMissingColumnError(error)) return (categorySupported = false)
    return false
  })().finally(() => {
    categoryProbe = null
  })
  return categoryProbe
}

export function resetQualityCategorySupportedCache() {
  categorySupported = null
  categoryProbe = null
}

// Migration 048: "quality master".check_type (Measured / Gauge) + gauge_ref,
// readings.gauge_result. Until it is run the app keeps Measured-only
// behaviour and hides Check Type / Gauge. Cached once known; a network error
// is not cached. Before 048 the probe shows one expected 400 in the console.
let checkTypeSupported = null
let checkTypeProbe = null

export async function qualityCheckTypeSupported() {
  if (checkTypeSupported !== null) return checkTypeSupported
  checkTypeProbe ??= (async () => {
    let error
    try {
      ;({ error } = await supabase.from(TABLE).select('check_type').limit(0))
    } catch {
      return false
    }
    if (!error) return (checkTypeSupported = true)
    if (isMissingColumnError(error)) return (checkTypeSupported = false)
    return false
  })().finally(() => {
    checkTypeProbe = null
  })
  return checkTypeProbe
}

export function resetQualityCheckTypeCache() {
  checkTypeSupported = null
  checkTypeProbe = null
}

/** 048: true when the parameter already has inspection readings (its Check
 * Type is then fixed -- the DB refuses a change too). */
export async function parameterHasReadings(parameterId) {
  if (!parameterId) return false
  const { data, error } = await supabase.from('quality log readings').select('id').eq('quality_parameter_id', parameterId).limit(1)
  if (error) throw error
  return (data ?? []).length > 0
}
