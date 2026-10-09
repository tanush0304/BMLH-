import { supabase } from '../../lib/supabaseClient'

// The FG / WIP master views carry no drawing number; it is looked up from
// Products Master for display only.
async function withDrawingNumbers(rows) {
  const { data, error } = await supabase
    .from('products master')
    .select('part_serial_number, part_drawing_reference_number')
  if (error) throw error
  const byPart = new Map((data ?? []).map((p) => [p.part_serial_number, p.part_drawing_reference_number]))
  return (rows ?? []).map((row) => ({ ...row, part_drawing_reference_number: byPart.get(row.part_serial_number) ?? '' }))
}

export async function listFinishedGoodsMaster() {
  const { data, error } = await supabase
    .from('finished goods master')
    .select('*')
    .order('prd_no')
  if (error) throw error
  return withDrawingNumbers(data)
}

export async function listWipMaster() {
  const { data, error } = await supabase
    .from('wip master')
    .select('*')
    .order('prd_no')
    .order('stage_seq')
  if (error) throw error
  return withDrawingNumbers(data)
}

export async function listRawMaterialStockMaster() {
  const { data, error } = await supabase
    .from('raw material stock master')
    .select('*')
    .order('raw_material_code')
    .order('part_serial_number', { nullsFirst: true })
  if (error) throw error
  return data
}
