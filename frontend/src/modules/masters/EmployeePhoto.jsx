// Employee photo (060) inside the Personal details card: thumbnail via a
// 1-hour signed URL, upload with preview (resized in the browser to fit
// 400x400, JPEG ~85 %), Replace (old file deleted) and Remove (file deleted).
// PRIVACY: no console output; errors are fixed texts (no path / URL);
// signed / preview URLs live only in this component's state.
import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2, UserRound } from 'lucide-react'
import Banner from '../../components/Banner'
import ConfirmDialog from '../../components/ConfirmDialog'
import { uploadEmployeePhoto, removeEmployeePhotoFile, signedEmployeePhotoUrl, saveEmployeePrivate } from '../../data/queries/employeePrivate'
import { resizeToJpeg } from '../../utils/imageResize'
import {
  PHOTO_MAX_SIDE, PHOTO_QUALITY, PHOTO_TYPES, PHOTO_UPLOAD_MAX_BYTES, photoPath, photoFileProblem, photoErrorText,
} from '../../utils/employeePhoto'

export default function EmployeePhoto({ employeeId, path, onChange }) {
  const [url, setUrl] = useState(null) // signed URL of the saved photo
  const [preview, setPreview] = useState(null) // { blob, url } of the picked + resized photo
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const fileInput = useRef(null)

  useEffect(() => {
    let active = true
    setUrl(null)
    if (!path) return undefined
    signedEmployeePhotoUrl(path)
      .then((u) => active && setUrl(u))
      .catch((e) => active && setError(photoErrorText(e, 'load')))
    return () => { active = false }
  }, [path])

  // free the preview object URL when it changes / on unmount
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url) }, [preview])

  async function handlePick(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // the same file can be picked again
    setError(null)
    setNotice(null)
    const problem = photoFileProblem(file)
    if (problem) {
      setError(problem)
      return
    }
    try {
      const blob = await resizeToJpeg(file, PHOTO_MAX_SIDE, PHOTO_QUALITY)
      if (blob.size > PHOTO_UPLOAD_MAX_BYTES) {
        setError(photoErrorText({ code: 'too_large' }))
        return
      }
      setPreview({ blob, url: URL.createObjectURL(blob) })
    } catch (err) {
      setError(photoErrorText(err))
    }
  }

  async function handleSave() {
    if (!preview) return
    setBusy(true)
    setError(null)
    const newPath = photoPath(employeeId)
    try {
      await uploadEmployeePhoto(newPath, preview.blob)
    } catch (err) {
      setError(photoErrorText(err))
      setBusy(false)
      return
    }
    try {
      await saveEmployeePrivate({ employee_id: employeeId, photo_path: newPath })
    } catch (err) {
      await removeEmployeePhotoFile(newPath).catch(() => {}) // don't leave the new file behind
      setError(photoErrorText(err))
      setBusy(false)
      return
    }
    const oldPath = path
    setPreview(null)
    onChange?.(newPath)
    let msg = 'Photo saved.'
    if (oldPath && oldPath !== newPath) {
      try {
        await removeEmployeePhotoFile(oldPath)
      } catch {
        msg = 'Photo saved; the old photo file could not be deleted.'
      }
    }
    setNotice(msg)
    setBusy(false)
  }

  async function doRemove() {
    const oldPath = path
    setError(null)
    setNotice(null)
    try {
      await saveEmployeePrivate({ employee_id: employeeId, photo_path: null })
    } catch (err) {
      setError(photoErrorText(err, 'remove'))
      return
    }
    onChange?.(null)
    try {
      await removeEmployeePhotoFile(oldPath)
      setNotice('Photo removed.')
    } catch {
      setNotice('Photo removed; the photo file could not be deleted.')
    }
  }

  const shown = preview?.url ?? url
  return (
    <div className="flex items-start gap-3" data-testid="employee-photo">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded border border-gray-300 bg-gray-50 flex items-center justify-center">
        {shown
          ? <img src={shown} alt={preview ? 'New photo preview' : 'Employee photo'} className="h-full w-full object-cover" />
          : <UserRound size={36} className="text-gray-300" aria-label="No photo" />}
      </div>
      <div className="flex flex-col gap-1.5 text-xs">
        {error && <Banner tone="error" message={error} onClose={() => setError(null)} />}
        {notice && <Banner tone="success" message={notice} onClose={() => setNotice(null)} />}
        <input ref={fileInput} type="file" accept={PHOTO_TYPES.join(',')} className="hidden" aria-label="Choose photo" onChange={handlePick} />
        {preview ? (
          <div className="flex gap-2">
            <button type="button" onClick={handleSave} disabled={busy} className="h-8 rounded bg-[#1F3A5F] px-3 text-white disabled:opacity-50">
              {busy ? 'Saving…' : 'Save photo'}
            </button>
            <button type="button" onClick={() => setPreview(null)} disabled={busy} className="h-8 rounded border border-gray-300 px-3">Cancel</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => fileInput.current?.click()} disabled={busy} className="inline-flex items-center gap-1 h-8 rounded border border-gray-300 px-3 text-[#1F3A5F]">
              <Camera size={13} /> {path ? 'Replace photo' : 'Upload photo'}
            </button>
            {path && (
              <button type="button" onClick={() => setConfirmRemove(true)} disabled={busy} className="inline-flex items-center gap-1 h-8 rounded border border-gray-300 px-3 text-red-700">
                <Trash2 size={13} /> Remove photo
              </button>
            )}
          </div>
        )}
        <span className="text-[11px] text-slate-500">JPEG or PNG; resized to {PHOTO_MAX_SIDE}×{PHOTO_MAX_SIDE}. Shown here only.</span>
      </div>
      <ConfirmDialog
        open={confirmRemove}
        title="Remove photo?"
        body={`The photo of ${employeeId} will be deleted. This can't be undone.`}
        confirmLabel="Remove"
        onConfirm={doRemove}
        onClose={() => setConfirmRemove(false)}
      />
    </div>
  )
}
