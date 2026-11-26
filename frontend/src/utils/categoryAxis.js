// Shared X-axis setup for report charts whose X axis is a CATEGORY (machines,
// operations, customers, vendors, parts, defects ...). Date axes and donuts
// don't use it. Spread `axis` on <XAxis>, add `marginLeft` to the chart's
// margin.left and `extraHeight` to the ChartCard height:
//
//   const ax = categoryAxisProps(rows.map((r) => r.machine_name))
//   <ChartCard height={260 + ax.extraHeight}>
//     <ComposedChart margin={{ ..., left: ax.marginLeft }}>
//       <XAxis dataKey="machine_name" {...ax.axis} />
//
// Every label is shown (interval 0) at full length. Few bars with short
// names stay horizontal; otherwise labels are rotated -40 deg (textAnchor
// end) and the axis gets enough height for the longest name, so nothing is
// clipped on screen, in the expanded views or in the PNG exports (they
// capture what is drawn).

// Same values as ChartCard's AXIS_TICK (kept here so this util has no UI imports).
const AXIS_TICK = { fontSize: 11, fill: '#475569' }

export const ROTATE_ANGLE = -40
export const MAX_FLAT_BARS = 6
export const MAX_FLAT_CHARS = 10
export const FLAT_AXIS_HEIGHT = 30
const CHAR_WIDTH = 0.62 // average glyph width / font size (sans-serif)
const PAD = 12

const rad = (Math.abs(ROTATE_ANGLE) * Math.PI) / 180
const textWidth = (chars, fontSize) => chars * fontSize * CHAR_WIDTH

/** True when the labels need rotating (more than 6 bars or a name > 10 chars). */
export function shouldRotate(labels, { maxBars = MAX_FLAT_BARS, maxChars = MAX_FLAT_CHARS } = {}) {
  const list = (labels ?? []).map((l) => String(l ?? ''))
  return list.length > maxBars || list.some((l) => l.length > maxChars)
}

/** Axis height (px) a rotated label of `chars` characters needs. */
export function rotatedAxisHeight(chars, fontSize = AXIS_TICK.fontSize) {
  const h = textWidth(chars, fontSize) * Math.sin(rad) + fontSize * Math.cos(rad) + PAD
  return Math.max(FLAT_AXIS_HEIGHT, Math.ceil(h))
}

export function categoryAxisProps(labels, opts = {}) {
  const fontSize = opts.fontSize ?? AXIS_TICK.fontSize
  const tick = { ...AXIS_TICK, fontSize }
  const list = (labels ?? []).map((l) => String(l ?? ''))
  if (!shouldRotate(list, opts)) {
    return {
      rotated: false,
      axis: { tick, interval: 0, angle: 0, textAnchor: 'middle', height: FLAT_AXIS_HEIGHT },
      marginLeft: 0,
      extraHeight: 0,
    }
  }
  const longest = list.reduce((m, l) => Math.max(m, l.length), 0)
  const height = rotatedAxisHeight(longest, fontSize)
  // The first label hangs left of its bar; give it room beyond the Y axis (~40 px).
  const firstReach = textWidth((list[0] ?? '').length, fontSize) * Math.cos(rad)
  const marginLeft = Math.max(0, Math.ceil(firstReach - 40))
  return {
    rotated: true,
    axis: { tick, interval: 0, angle: ROTATE_ANGLE, textAnchor: 'end', height },
    marginLeft,
    extraHeight: height - FLAT_AXIS_HEIGHT,
  }
}
