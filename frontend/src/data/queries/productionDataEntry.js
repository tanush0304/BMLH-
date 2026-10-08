import { supabase } from '../../lib/supabaseClient'
import { machinesEligibleForSeqs } from '../../utils/machineEligibility'

/**
 * The reverse lookup used by Production Data Entry's PRD-first flow: given the set
 * of seqs a PRD's own eligible (Pending, Internal) stages need, finds
 * every machine capable of running at least one of them.
 *
 * Eligibility comes from Cycle Time Master (part_serial_number + seq +
 * machine_id) -- the route itself says which machines can run which stage
 * -- not from text-matching an operation name against "machine
 * operations" (that table is Machine Master's own informational list and
 * never used to decide this; see utils/machineEligibility.js). Guards a
 * missing part serial number by returning an empty list rather than sending an
 * undefined filter to the DB.
 *
 * Returns raw {machine_id, seq} rows, not deduped by machine_id, so the
 * caller can intersect one specific machine's own capabilities against
 * the PRD's stage list once Machine is actually chosen (to resolve which
 * stage, when more than one is eligible) without a second query.
 */
export async function listMachinesForProductSeqs(partSerialNumber, seqs) {
  if (!partSerialNumber || seqs.length === 0) return []
  const { data, error } = await supabase
    .from('cycle time master')
    .select('machine_id, seq, part_serial_number')
    .eq('part_serial_number', partSerialNumber)
  if (error) throw error
  return machinesEligibleForSeqs({ cycleTimeRows: data, partSerialNumber, seqs })
}
