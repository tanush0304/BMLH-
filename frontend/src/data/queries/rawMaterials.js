import { supabase } from '../../lib/supabaseClient'

const TABLE = 'raw materials master'

export async function listRawMaterials() {
  const { data, error } = await supabase.from(TABLE).select('*').order('raw_material_code')
  if (error) throw error
  return data
}

export async function createRawMaterial(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateRawMaterial(rawMaterialCode, payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('raw_material_code', rawMaterialCode)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteRawMaterial(rawMaterialCode) {
  const { error } = await supabase.from(TABLE).delete().eq('raw_material_code', rawMaterialCode)
  if (error) throw error
}

// Migration 041 adds "raw materials master".grade. Until it is run the
// column is missing, so the app hides Grade instead of failing. The answer
// is cached once known; a network error is not cached (retried next call).
// Before 041 the probe shows one expected 400 in the browser console.
let gradeSupported = null
let gradeProbe = null
export async function rmGradeSupported() {
  if (gradeSupported !== null) return gradeSupported
  gradeProbe ??= (async () => {
    const { error } = await supabase.from(TABLE).select('grade').limit(0)
    if (!error) return (gradeSupported = true)
    if (isMissingColumnError(error)) return (gradeSupported = false)
    return false
  })().finally(() => {
    gradeProbe = null
  })
  return gradeProbe
}

export function isMissingColumnError(error) {
  const text = `${error?.message ?? ''} ${error?.details ?? ''}`
  return error?.code === '42703' || error?.code === 'PGRST204' || /column .*does not exist|could not find the .* column/i.test(text)
}

export function resetRmGradeSupportedCache() {
  gradeSupported = null
  gradeProbe = null
}
