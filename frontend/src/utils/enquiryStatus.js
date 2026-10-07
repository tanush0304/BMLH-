// Customer Enquiry's list Status is derived, never stored:
//   - "Ordered"    if any customer order references this exact QTN.
//   - "Superseded" if a later revision of the same root enquiry exists.
//   - "Open"       otherwise.
// Checked in that order -- an old revision that was itself ordered stays
// "Ordered" even once a newer revision exists, it doesn't flip to
// "Superseded" just because a later revision was drafted.
export function deriveEnquiryStatuses(enquiries, orders) {
  const prdsByQtn = new Map()
  for (const o of orders) {
    if (!o.qtn_no) continue
    const list = prdsByQtn.get(o.qtn_no) ?? []
    list.push(o.prd_no)
    prdsByQtn.set(o.qtn_no, list)
  }

  const maxRevisionByRoot = new Map()
  for (const e of enquiries) {
    const root = e.parent_qtn_no || e.qtn_no
    const rev = e.revision_no ?? 0
    maxRevisionByRoot.set(root, Math.max(maxRevisionByRoot.get(root) ?? 0, rev))
  }

  const result = new Map()
  for (const e of enquiries) {
    const root = e.parent_qtn_no || e.qtn_no
    const rev = e.revision_no ?? 0
    const linkedPrds = prdsByQtn.get(e.qtn_no) ?? []
    let status
    if (linkedPrds.length > 0) {
      status = 'Ordered'
    } else if (rev < (maxRevisionByRoot.get(root) ?? 0)) {
      status = 'Superseded'
    } else {
      status = 'Open'
    }
    result.set(e.qtn_no, { status, linkedPrds })
  }
  return result
}
