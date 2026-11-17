import { supabase } from '../../lib/supabaseClient'
import { isMissingColumnError } from './openPo'

// Migration 057: "quality log readings".sample_no (several samples per
// parameter). Until it is run the Samples control is hidden and sample_no is
// never sent. Cached once known; a network error is not cached. Before 057
// the probe shows one expected 400 in the console.
let supported = null
let probe = null

export async function qualitySamplesSupported() {
  if (supported !== null) return supported
  probe ??= (async () => {
    let error
    try {
      ;({ error } = await supabase.from('quality log readings').select('sample_no').limit(0))
    } catch {
      return false
    }
    if (!error) return (supported = true)
    if (isMissingColumnError(error)) return (supported = false)
    return false
  })().finally(() => {
    probe = null
  })
  return probe
}

/** Tests only. */
export function resetQualitySamplesProbe() {
  supported = null
  probe = null
}
