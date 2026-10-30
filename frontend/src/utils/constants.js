// subItems' keys/labels here must match each module's own internal TABS/
// ENTITIES array exactly -- this is what the Sidebar's accordion renders,
// the module component itself still owns the key -> screen-component
// mapping (passed the active one via an `activeTab` prop instead of
// managing its own tab state, since selection now lives in the sidebar).
export const NAV_ITEMS = [
  {
    key: 'masters',
    label: 'Masters',
    roles: ['supervisor', 'admin'],
    // Data-entry order: people/partners, then machines and materials, then the
    // masters that reference them.
    subItems: [
      { key: 'employee', label: 'Employee Master' },
      { key: 'shift', label: 'Shift Master' },
      { key: 'customer', label: 'Customer Master' },
      { key: 'supplier', label: 'Supplier Master' },
      { key: 'vendor', label: 'Vendor Master' },
      { key: 'job-work', label: 'Job Work Master' },
      { key: 'machine', label: 'Machine Master' },
      { key: 'raw-material', label: 'Raw Material Master' },
      { key: 'product', label: 'Product Master' },
      { key: 'cycle-time', label: 'Cycle Time Master' },
      { key: 'production-batch', label: 'Production Batch Master' },
      { key: 'quality', label: 'Quality Master' },
      { key: 'maintenance', label: 'Maintenance Master' },
      { key: 'route-card', label: 'Route Card' },
      { key: 'wip', label: 'WIP Master' },
      { key: 'finished-goods', label: 'Finished Goods Master' },
    ],
  },
  {
    key: 'customer-order',
    label: 'Customer Orders',
    roles: ['supervisor', 'admin'],
    subItems: [
      { key: 'enquiry', label: 'New Enquiry' },
      { key: 'order', label: 'New Order' },
    ],
  },
  {
    key: 'production',
    label: 'Production',
    subItems: [
      // Creates PRDs + route cards (030) -- supervisor/admin only.
      { key: 'planning', label: 'Production Planning', roles: ['supervisor', 'admin'] },
      { key: 'production-data-entry', label: 'Production Data Entry' },
      { key: 'manual-operations', label: 'Manual Operations' },
      { key: 'route-card', label: 'Production Route Card' },
      // Shift in-charge sign-off (migration 028) -- supervisor/admin only.
      { key: 'shift-verification', label: 'Shift Verification', roles: ['supervisor', 'admin'] },
    ],
  },
  {
    key: 'job-order',
    label: 'Jobwork',
    roles: ['supervisor', 'admin'],
    subItems: [
      { key: 'dispatch', label: 'Despatch' },
      { key: 'receipt', label: 'Receipt' },
    ],
  },
  {
    key: 'quality',
    label: 'Quality',
    subItems: [
      { key: 'inspection', label: 'Quality Inspection' },
      { key: 'complaint', label: 'Customer Complaint' },
    ],
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    subItems: [
      { key: 'checklist', label: 'Checklist Entry' },
      { key: 'plan', label: 'Preventive Maintenance' },
    ],
  },
  {
    key: 'stores',
    label: 'Stores',
    subItems: [
      { key: 'rm', label: 'Raw Material Stores' },
      { key: 'fg', label: 'Finished Goods Stores' },
      { key: 'wip-receipt', label: 'WIP Receipt' },
      { key: 'wip-issue', label: 'WIP Issue' },
      { key: 'rm-requisition', label: 'Raw Material Requisition' },
    ],
  },
  {
    key: 'dashboard',
    label: 'Reports & Dashboard',
    roles: ['supervisor', 'admin'],
    // The module opens a landing with the 9 report cards -- order, names and
    // descriptions from the client deck (Main UI Interface.pptx, slide 18;
    // "Downtine" typo fixed, "despatch" -> "dispatch"). PO Summary /
    // Production Schedule / Order Traceability (moved here from Customer
    // Orders and Production) stay in the sidebar only (landing: false).
    subItems: [
      { key: 'customer-order-status', label: 'Customer Order Status', description: 'Track customer orders, PO quantities and despatch status.' },
      { key: 'job-order-status', label: 'Job Order Status', description: 'Monitor job orders, progress and completion status.' },
      { key: 'production-status', label: 'Production Status', description: 'View production plan vs actual, output and efficiency.' },
      { key: 'daily-machine', label: 'Daily Machine Status', description: 'Check real-time machine running, idle and setup status.' },
      { key: 'downtime', label: 'Machine Downtime', description: 'Analyze downtime reasons, duration and trends.' },
      { key: 'quality-status', label: 'Quality Status', description: 'Track inspection results, rejections and quality trends.' },
      { key: 'wip-status', label: 'WIP Status', description: 'Monitor work-in-progress inventory across stages.' },
      { key: 'rm-status', label: 'Raw Material Status', description: 'View raw material stock levels, consumption and reorder status.' },
      { key: 'fg-inventory', label: 'Finished Goods Status', description: 'Track finished goods inventory and despatch status.' },
      // Added after the client demo (2026-10-17) -- not on deck slide 18.
      { key: 'complaint-status', label: 'Customer Complaint Status', description: 'Track complaints by customer, defect, part and severity.' },
      { key: 'po-summary', label: 'PO Summary', landing: false },
      { key: 'schedule', label: 'Production Schedule', landing: false },
      { key: 'traceability', label: 'Order Traceability', landing: false },
    ],
  },
]

/** A module's display label from NAV_ITEMS. */
export function moduleLabel(topKey) {
  return NAV_ITEMS.find((n) => n.key === topKey)?.label ?? ''
}

/** A sub-screen's display label from NAV_ITEMS (sidebar, tiles, headers). */
export function subItemLabel(topKey, subKey) {
  return NAV_ITEMS.find((n) => n.key === topKey)?.subItems?.find((s) => s.key === subKey)?.label ?? ''
}

// Stores landing: RM and FG each have one combined screen with Issue/Receipt
// (Dispatch/Receipt) tabs, so they get two tiles each that open that screen
// with the matching tab pre-selected (`mode` = the screen's own tab key).
// Raw Material Requisition has no tile -- sidebar only.
export const STORES_LANDING_TILES = [
  { key: 'rm-receipt', label: 'Raw Material Receipt', subKey: 'rm', mode: 'receipt' },
  { key: 'rm-issue', label: 'Raw Material Issue', subKey: 'rm', mode: 'issue' },
  { key: 'wip-receipt', label: 'WIP Receipt', subKey: 'wip-receipt' },
  { key: 'wip-issue', label: 'WIP Issue', subKey: 'wip-issue' },
  { key: 'fg-receipt', label: 'Finished Goods Receipt', subKey: 'fg', mode: 'production-receipt' },
  { key: 'fg-despatch', label: 'Finished Goods Despatch', subKey: 'fg', mode: 'dispatch' },
]

export const STATUS_COLORS = {
  Pending: 'bg-amber-100 text-amber-800',
  Completed: 'bg-green-100 text-green-800',
  Received: 'bg-blue-100 text-blue-800',
  // Jobwork DC / stage (031): Sent -> Partially Received -> Received | Closed Short
  Sent: 'bg-amber-100 text-amber-800',
  'Partially Received': 'bg-sky-100 text-sky-800',
  'Closed Short': 'bg-slate-200 text-slate-700',
  'Not Sent': 'bg-gray-100 text-gray-600',
  Overdue: 'bg-red-100 text-red-800',
  Active: 'bg-green-100 text-green-800',
  Inactive: 'bg-gray-100 text-gray-600',
  Planned: 'bg-amber-100 text-amber-800',
  Accepted: 'bg-green-100 text-green-800',
  'Not Accepted': 'bg-red-100 text-red-800',
  'Not Completed': 'bg-red-100 text-red-800',
  Open: 'bg-blue-100 text-blue-800',
  Ordered: 'bg-green-100 text-green-800',
  Superseded: 'bg-gray-100 text-gray-600',
  'Under Investigation': 'bg-amber-100 text-amber-800',
  'Action Pending': 'bg-orange-100 text-orange-800',
  Resolved: 'bg-teal-100 text-teal-800',
  Closed: 'bg-gray-100 text-gray-700',
  Approved: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-800',
  'No entry': 'bg-gray-100 text-gray-600',
}

/** True when a module lists `roles` in NAV_ITEMS and `role` is not one of
 * them (Masters, Customer Orders, Jobwork, Reports & Dashboard): App shows
 * "Supervisor or admin access required." instead of the module. */
export function isModuleRestricted(moduleKey, role) {
  return NAV_ITEMS.find((item) => item.key === moduleKey)?.roles?.includes(role) === false
}

/** A sub-screen is visible to `role` unless it lists `roles` without it. */
export function canSeeSubItem(subItem, role) {
  return !subItem.roles || subItem.roles.includes(role)
}

/**
 * Which machines Production Data Entry / Quality Inspection offer for a stage
 * (utils/machineEligibility.js machinesForStage):
 *   'capable'  -- planned machine + machines whose "machine operations" match
 *                 the stage operation (+ Cycle Time Master machines); no
 *                 match -> the planned machine's category
 *   'category' -- planned machine + every machine of its category (+ Cycle Time)
 *   'any'      -- planned machine + every machine
 */
export const MACHINE_CHOICE_MODE = 'capable'

/** Reasons for running a stage on a machine other than the planned one (040). */
export const SUBSTITUTE_REASONS = ['Planned machine busy', 'Breakdown', 'Supervisor instruction', 'Other']

// Daily checklist gate on Production Data Entry (DailyChecklistGate): when
// true, a new log on an Internal stage waits for today's Daily checklist on
// the machine + shift (on since 2026-10-30). Set false to turn it off: no
// panel, Start unaffected.
export const DAILY_CHECKLIST_GATE_ENABLED = true
