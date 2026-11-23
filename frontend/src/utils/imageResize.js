// Browser-side resize: fit inside max x max (never enlarged), re-encode as
// JPEG. Used for employee photos (400 x 400, ~85 %). Throws an Error with
// code 'resize' when the image can't be read / encoded (no details kept).

/** Target size that fits inside max x max, keeping the aspect ratio. */
export function fitWithin(width, height, max) {
  if (!width || !height) return { width: 0, height: 0 }
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function fail() {
  const e = new Error('image could not be resized')
  e.code = 'resize'
  return e
}

async function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      throw fail()
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(fail())
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** File / Blob -> JPEG Blob that fits inside max x max. */
export async function resizeToJpeg(file, max = 400, quality = 0.85) {
  const img = await loadImage(file)
  const { width, height } = fitWithin(img.width, img.height, max)
  if (!width) throw fail()
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw fail()
  ctx.fillStyle = '#ffffff' // PNG transparency -> white, not black, in the JPEG
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  img.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw fail()
  return blob
}
