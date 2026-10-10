import { supabase } from '../../lib/supabaseClient'

const TABLE = 'customer complaints'
const ATTACHMENTS = 'customer complaint attachments'
export const COMPLAINT_BUCKET = 'complaint-attachments'

export async function listComplaints() {
  const { data, error } = await supabase.from(TABLE).select('*').order('id', { ascending: false })
  if (error) throw error
  return data
}

/** complaint_no is assigned by the DB trigger (027) -- never sent. */
export async function createComplaint(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateComplaint(id, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function listComplaintAttachments(complaintId) {
  const { data, error } = await supabase
    .from(ATTACHMENTS)
    .select('*')
    .eq('complaint_id', complaintId)
    .order('id')
  if (error) throw error
  return data
}

/** Uploads each file to Storage under <complaint_no>/, then records it. */
export async function uploadComplaintAttachments(complaint, files) {
  for (const file of files) {
    const safeName = file.name.replace(/[^\w.-]+/g, '_')
    const path = `${complaint.complaint_no}/${Date.now()}_${safeName}`
    const { error: uploadError } = await supabase.storage
      .from(COMPLAINT_BUCKET)
      .upload(path, file, { contentType: file.type || undefined })
    if (uploadError) throw uploadError
    const { error } = await supabase.from(ATTACHMENTS).insert({
      complaint_id: complaint.id,
      file_path: path,
      file_name: file.name,
      content_type: file.type || null,
      size_bytes: file.size,
    })
    if (error) throw error
  }
}

/** Private bucket: a short-lived signed URL to open a file. */
export async function complaintAttachmentUrl(filePath) {
  const { data, error } = await supabase.storage.from(COMPLAINT_BUCKET).createSignedUrl(filePath, 300)
  if (error) throw error
  return data.signedUrl
}
