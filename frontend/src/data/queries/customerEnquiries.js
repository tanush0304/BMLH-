import { supabase } from '../../lib/supabaseClient'

const TABLE = 'customer enquiries'

export async function listCustomerEnquiries() {
  const { data, error } = await supabase.from(TABLE).select('*').order('qtn_no')
  if (error) throw error
  return data
}

export async function createCustomerEnquiry(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

/**
 * QTN numbers are "QTN-001", "QTN-002", ... (matching the two seed rows
 * already in the table) -- next number is the highest existing suffix + 1.
 * qtn_no is this table's primary key, so a collision from a genuine race
 * surfaces as a real Postgres 23505, not silent data loss; callers should
 * show that plainly rather than retry-looping, same as other generated
 * codes in this app (e.g. Vendor Master's job work code).
 */
export async function generateNextQtnNo() {
  const { data, error } = await supabase.from(TABLE).select('qtn_no')
  if (error) throw error
  const maxNum = data.reduce((max, r) => {
    const match = /^QTN-(\d+)$/.exec(r.qtn_no ?? '')
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `QTN-${String(maxNum + 1).padStart(3, '0')}`
}

/**
 * A revision is its own row (qtn_no is the PK, so it needs its own unique
 * value) but stays linked to the ORIGINAL enquiry via parent_qtn_no -- not
 * to whatever revision it was created from, so every revision of the same
 * enquiry points to one common root instead of chaining. revision_no is
 * the next number among all revisions sharing that same root.
 */
export async function createEnquiryRevision(rootQtnNo, payload) {
  const { data: siblings, error: sibErr } = await supabase
    .from(TABLE)
    .select('revision_no')
    .eq('parent_qtn_no', rootQtnNo)
  if (sibErr) throw sibErr
  const nextRevision = siblings.reduce((max, r) => Math.max(max, r.revision_no ?? 0), 0) + 1
  const qtnNo = await generateNextQtnNo()
  return createCustomerEnquiry({ ...payload, qtn_no: qtnNo, parent_qtn_no: rootQtnNo, revision_no: nextRevision })
}

export async function updateCustomerEnquiry(qtnNo, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('qtn_no', qtnNo).select().single()
  if (error) throw error
  return data
}

export async function deleteCustomerEnquiry(qtnNo) {
  const { error } = await supabase.from(TABLE).delete().eq('qtn_no', qtnNo)
  if (error) throw error
}
