import { supabase } from '../../lib/supabaseClient'

export async function listFinishedGoodsMaster() {
  const { data, error } = await supabase
    .from('finished goods master')
    .select('*')
    .order('prd_no')
  if (error) throw error
  return data
}

export async function listWipMaster() {
  const { data, error } = await supabase
    .from('wip master')
    .select('*')
    .order('prd_no')
    .order('stage_seq')
  if (error) throw error
  return data
}
