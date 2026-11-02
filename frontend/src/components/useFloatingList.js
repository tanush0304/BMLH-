import { useLayoutEffect, useState } from 'react'

export const FLOATING_MAX_HEIGHT = 260
const MIN_WIDTH = 200
const GAP = 4

/**
 * Position for a dropdown list rendered in a portal on document.body, so a
 * card's overflow-hidden can't clip it. Anchored to `anchorRef`'s bounding
 * rect (position: fixed), width = anchor width (min 200px), opens upwards
 * when there isn't room below. Follows scroll (any scroll container) and
 * resize while open.
 */
export function floatingListStyle(rect, viewportHeight, maxHeight = FLOATING_MAX_HEIGHT) {
  const below = viewportHeight - rect.bottom - GAP
  const above = rect.top - GAP
  const up = below < Math.min(maxHeight, 160) && above > below
  const room = Math.max(80, (up ? above : below) - 8)
  const style = {
    position: 'fixed',
    left: rect.left,
    width: Math.max(rect.width, MIN_WIDTH),
    maxHeight: Math.min(maxHeight, room),
  }
  if (up) style.bottom = viewportHeight - rect.top + GAP
  else style.top = rect.bottom + GAP
  return { style, up }
}

export default function useFloatingList(anchorRef, open, maxHeight = FLOATING_MAX_HEIGHT) {
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return undefined
    }
    function update() {
      const el = anchorRef.current
      if (!el) return
      setPos(floatingListStyle(el.getBoundingClientRect(), window.innerHeight, maxHeight))
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [anchorRef, open, maxHeight])

  return pos
}
