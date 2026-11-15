// Chart Expand / Export helpers shared by ChartCard (components/reports).
import { displayDate } from './reportPeriods'

/** Nodes carrying this attribute (the Expand / Export buttons, the open
 * Export menu) are left out of the PNG -- see pngFilter. */
export const EXPORT_EXCLUDE_ATTR = 'data-export-exclude'

/** html-to-image `filter`: false for any element marked EXPORT_EXCLUDE_ATTR. */
export function pngFilter(node) {
  return !(node?.hasAttribute?.(EXPORT_EXCLUDE_ATTR))
}

/** YYYY-MM-DD of `date` in local time (file names). */
export function isoDay(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

/** One file-name part: letters / digits kept, everything else -> "_"
 * ("Efficiency (By Machine)" -> "Efficiency_By_Machine"). */
export function fileNamePart(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** "<Screen>_<Chart>_<YYYY-MM-DD>" (no extension). */
export function chartFileName(screen, exportKey, date = new Date()) {
  return [fileNamePart(screen), fileNamePart(exportKey), isoDay(date)].filter(Boolean).join('_')
}

/** "Exported DD-MM-YYYY" line for the PNG header. */
export function exportedLine(date = new Date()) {
  return `Exported ${displayDate(isoDay(date))}`
}

/** Filter / date-range line: "01-04-2026 to 14-11-2026 · Customer: Acme".
 *   applied: useReportPeriod().applied ({ from, to, ...filters })
 *   filters: [{ label, key, options? }] -- options = the filter bar's options
 *            (plain values or { value, label }) to show labels, not codes.
 * Blank filters are left out. */
export function reportFilterText(applied, filters = []) {
  const parts = []
  if (applied?.from && applied?.to) parts.push(`${displayDate(applied.from)} to ${displayDate(applied.to)}`)
  for (const f of filters) {
    const value = applied?.[f.key]
    if (value === '' || value == null) continue
    const opt = (f.options ?? []).find((o) => String(typeof o === 'object' ? o.value : o) === String(value))
    const label = opt == null ? value : typeof opt === 'object' ? opt.label ?? opt.value : opt
    parts.push(`${f.label}: ${label}`)
  }
  return parts.join(' · ')
}

/** exportData for a DonutChart: one row per slice (label, value, share % of
 * the positive total -- the same numbers the legend shows). */
export function donutExportData(data, { labelHeader = 'Category', valueHeader = 'Value' } = {}) {
  const total = (data ?? []).reduce((a, d) => a + (d.value > 0 ? d.value : 0), 0)
  return {
    columns: [
      { key: 'label', label: labelHeader },
      { key: 'value', label: valueHeader },
      { key: 'share', label: 'Share %' },
    ],
    rows: (data ?? []).map((d) => ({
      label: d.label,
      value: d.value,
      share: total > 0 ? Math.round((1000 * Math.max(d.value, 0)) / total) / 10 : 0,
    })),
  }
}

/** exportData for a Recharts series chart: the chart's own rows, columns =
 * the category (x / y axis) field + each series with its legend name. */
export function seriesExportData(rows, categoryKey, categoryLabel, series) {
  return {
    columns: [{ key: categoryKey, label: categoryLabel }, ...series.map((s) => ({ key: s.key, label: s.label }))],
    rows: (rows ?? []).map((r) => Object.fromEntries([[categoryKey, r[categoryKey]], ...series.map((s) => [s.key, r[s.key] ?? ''])])),
  }
}

/** Saves a data: / blob: URL as `filename` (same <a download> pattern as exportToCsv). */
export function downloadDataUrl(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/** Filter line from a screen's ReportFilterBar `filters` array: `keyMap`
 * maps each field's `key` to its key in `applied` ({ prd: 'prdNo', ... });
 * fields not in the map are left out. Uses the field's own options (labels). */
export function fieldsFilterText(applied, fields, keyMap) {
  return reportFilterText(
    applied,
    (fields ?? []).filter((f) => keyMap[f.key]).map((f) => ({ label: f.label, key: keyMap[f.key], options: f.options })),
  )
}
