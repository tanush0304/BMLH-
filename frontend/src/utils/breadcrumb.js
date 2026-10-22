import { NAV_ITEMS } from './constants'

// Header breadcrumb (module > screen) from the same labels the sidebar shows.
// On a sub-screen the module crumb is a link back to its landing (onTop);
// on the landing itself there is a single, non-link crumb.
export function headerBreadcrumb(topKey, subKey, onTop) {
  const top = NAV_ITEMS.find((n) => n.key === topKey)
  if (!top) return []
  const sub = top.subItems?.find((s) => s.key === subKey)
  if (!sub) return [{ label: top.label }]
  return [onTop ? { label: top.label, onClick: onTop } : { label: top.label }, { label: sub.label }]
}
