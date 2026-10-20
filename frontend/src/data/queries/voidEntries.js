import { supabase } from '../../lib/supabaseClient'
import { voidRpcArgs } from '../../utils/voidEntry'

/** Void a GRN / DC / FGD (034). The RPC checks role, reason and the blocks
 * (GRN already issued, DC with receipts / closed) and throws the PostgREST
 * error (code kept) with the database's message. */
export async function voidEntry(type, docNo, reason) {
  const { data, error } = await supabase.rpc('void_entry', voidRpcArgs(type, docNo, reason))
  if (error) throw error
  return data
}
