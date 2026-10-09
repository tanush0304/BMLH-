import { supabase } from '../../lib/supabaseClient'

const TABLE = 'raw material requisitions'

export async function listRequisitions() {
  const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createRequisition(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

/**
 * REQ-<year>-<seq>, e.g. REQ-2026-001 -- sequence resets per year (only
 * numbers matching the CURRENT year's prefix count toward the max), same
 * reasoning as QTN/PRD/DC: requisition_no is this table's primary unique
 * value, so a genuine collision surfaces as a real Postgres 23505 rather
 * than silently colliding.
 */
export async function generateNextRequisitionNo() {
  const { data, error } = await supabase.from(TABLE).select('requisition_no')
  if (error) throw error
  const year = new Date().getFullYear()
  const prefix = `REQ-${year}-`
  const maxNum = data.reduce((max, r) => {
    const match = new RegExp(`^REQ-${year}-(\\d+)$`).exec(r.requisition_no ?? '')
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`
}

export async function listOrderMaterialRequirement() {
  const { data, error } = await supabase.from('order material requirement').select('*')
  if (error) throw error
  return data
}

export async function listOrderMaterialShortfall() {
  const { data, error } = await supabase.from('order material shortfall').select('*')
  if (error) throw error
  return data
}

/** Supervisor/admin edit of an existing row -- `patch` holds only the
 * editable fields (see utils/stockEdit.js). On the three stock tables the
 * migration-025 trigger stamps edited_by/edited_at/previous_qty and refuses
 * changes to the identifying columns. */
export async function updateRequisition(id, patch) {
  const { data, error } = await supabase.from('raw material requisitions').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}
