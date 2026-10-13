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
    subItems: [
      { key: 'employee', label: 'Employee Master' },
      { key: 'shift', label: 'Shift Master' },
      { key: 'customer', label: 'Customer Master' },
      { key: 'supplier', label: 'Supplier Master' },
      { key: 'raw-material', label: 'Raw Material Master' },
      { key: 'product', label: 'Product Master' },
      { key: 'production-batch', label: 'Production Batch Master' },
      { key: 'machine', label: 'Machine Master' },
      { key: 'cycle-time', label: 'Cycle Time Master' },
      { key: 'route-card', label: 'Route Card' },
      { key: 'maintenance', label: 'Maintenance Master' },
      { key: 'vendor', label: 'Vendor Master' },
      { key: 'job-work', label: 'Job Work Master' },
      { key: 'wip', label: 'WIP Master' },
      { key: 'finished-goods', label: 'Finished Goods Master' },
      { key: 'quality', label: 'Quality Master' },
    ],
  },
  {
    key: 'customer-order',
    label: 'Customer Orders',
    subItems: [
      { key: 'enquiry', label: 'New Enquiry' },
      { key: 'order', label: 'New Order' },
    ],
  },
  {
    key: 'production',
    label: 'Production',
    subItems: [
      { key: 'planning', label: 'Production Planning' },
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
    subItems: [
      { key: 'dispatch', label: 'Dispatch' },
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
      { key: 'plan', label: 'Planning' },
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
    // The module opens a landing with the 9 report cards -- order, names and
    // descriptions from the client deck (Main UI Interface.pptx, slide 18;
    // "Downtine" typo fixed, "despatch" -> "dispatch"). PO Summary /
    // Production Schedule / Order Traceability (moved here from Customer
    // Orders and Production) stay in the sidebar only (landing: false).
    subItems: [
      { key: 'customer-order-status', label: 'Customer Order Status', description: 'Track customer orders, PO quantities and dispatch status.' },
      { key: 'job-order-status', label: 'Job Order Status', description: 'Monitor job orders, progress and completion status.' },
      { key: 'production-status', label: 'Production Status', description: 'View production plan vs actual, output and efficiency.' },
      { key: 'daily-machine', label: 'Daily Machine Status', description: 'Check real-time machine running, idle and setup status.' },
      { key: 'downtime', label: 'Machine Downtime', description: 'Analyze downtime reasons, duration and trends.' },
      { key: 'quality-status', label: 'Quality Status', description: 'Track inspection results, rejections and quality trends.' },
      { key: 'wip-status', label: 'WIP Status', description: 'Monitor work-in-progress inventory across stages.' },
      { key: 'rm-status', label: 'Raw Material Status', description: 'View raw material stock levels, consumption and reorder status.' },
      { key: 'fg-inventory', label: 'Finished Goods Status', description: 'Track finished goods inventory and dispatch status.' },
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
export const STORES_LANDING_TILES = [
  { key: 'rm-receipt', label: 'Raw Material Receipt', subKey: 'rm', mode: 'receipt' },
  { key: 'rm-issue', label: 'Raw Material Issue', subKey: 'rm', mode: 'issue' },
  { key: 'wip-receipt', label: 'WIP Receipt', subKey: 'wip-receipt' },
  { key: 'wip-issue', label: 'WIP Issue', subKey: 'wip-issue' },
  { key: 'fg-receipt', label: 'Finished Goods Receipt', subKey: 'fg', mode: 'production-receipt' },
  { key: 'fg-despatch', label: 'Finished Goods Dispatch', subKey: 'fg', mode: 'dispatch' },
  { key: 'rm-requisition', label: 'Raw Material Requisition', subKey: 'rm-requisition' },
]

export const STATUS_COLORS = {
  Pending: 'bg-amber-100 text-amber-800',
  Completed: 'bg-green-100 text-green-800',
  Received: 'bg-blue-100 text-blue-800',
  Sent: 'bg-blue-100 text-blue-800',
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

/** A sub-screen is visible to `role` unless it lists `roles` without it. */
export function canSeeSubItem(subItem, role) {
  return !subItem.roles || subItem.roles.includes(role)
}
