// Employee photo (060): file naming, input checks, fixed error texts.
// PRIVACY: file names carry only the employee id + a timestamp; no message
// here ever contains a path or URL.

export const PHOTO_MAX_SIDE = 400
export const PHOTO_QUALITY = 0.85
export const PHOTO_INPUT_MAX_BYTES = 10 * 1024 * 1024 // before resizing
export const PHOTO_UPLOAD_MAX_BYTES = 2 * 1024 * 1024 // bucket limit (060)
export const PHOTO_TYPES = ['image/jpeg', 'image/png']

/** Same rule as 060's check: every char outside [A-Za-z0-9_-] -> "_". */
export const photoFolder = (employeeId) => String(employeeId ?? '').replace(/[^A-Za-z0-9_-]/g, '_')

/** "<employee id>/<timestamp>.jpg" -- nothing else goes into the name. */
export function photoPath(employeeId, now = Date.now()) {
  return `${photoFolder(employeeId)}/${Math.trunc(now)}.jpg`
}

/** Checks on the picked file before resizing. Message or null. */
export function photoFileProblem(file) {
  if (!file) return 'Choose a photo.'
  if (!PHOTO_TYPES.includes(file.type)) return 'Only JPEG or PNG photos.'
  if (file.size > PHOTO_INPUT_MAX_BYTES) return 'The photo is too large (max 10 MB before resizing).'
  return null
}

/** Fixed text by code only (never a Storage / DB message: they can carry the path). */
export function photoErrorText(error, action = 'upload') {
  switch (error?.code) {
    case 'too_large': return 'The photo must be under 2 MB.'
    case 'bad_type': return 'Only JPEG or PNG photos.'
    case 'forbidden':
    case '42501': return 'You do not have permission to change employee photos.'
    case 'resize': return 'Could not read this image -- try another JPEG or PNG.'
    default:
      if (error?.rls) return 'You do not have permission to change employee photos.'
      return action === 'load' ? 'Could not load the photo.'
        : action === 'remove' ? 'Could not remove the photo.'
          : 'Could not upload the photo.'
  }
}
