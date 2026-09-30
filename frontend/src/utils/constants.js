// subItems' keys/labels here must match each module's own internal TABS/
// ENTITIES array exactly -- this is what the Sidebar's accordion renders,
// the module component itself still owns the key -> screen-component
// mapping (passed the active one via an `activeTab` prop instead of
// managing its own tab state, since selection now lives in the sidebar).
export const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard' },
  {
    key: 'masters',
    label: 'Master List',
    roles: ['supervisor', 'admin'],
    subItems: [
      { key: 'product', label: 'Product Master' },
      { key: 'machine', label: 'Machine Master' },
      { key: 'job-work', label: 'Job Work Master' },
      { key: 'cycle-time', label: 'Cycle Time Master' },
      { key: 'customer', label: 'Customer Master' },
      { key: 'raw-material', label: 'Raw Material Master' },
      { key: 'supplier', label: 'Supplier Master' },
      { key: 'shift', label: 'Shift Master' },
      { key: 'operator', label: 'Operator Master' },
      { key: 'vendor', label: 'Vendor Master' },
      { key: 'quality', label: 'Quality Master' },
      { key: 'maintenance', label: 'Maintenance Master' },
      { key: 'production-batch', label: 'Production Batch Master' },
    ],
  },
  {
    key: 'production',
    label: 'Production',
    subItems: [
      { key: 'machine-entry', label: 'Machine Entry' },
      { key: 'schedule', label: 'Production Schedule' },
      { key: 'traceability', label: 'Order Traceability' },
      { key: 'planning', label: 'Production Planning' },
    ],
  },
  { key: 'quality', label: 'Quality' },
  {
    key: 'customer-order',
    label: 'Customer Order',
    subItems: [
      { key: 'enquiry', label: 'Customer Enquiries' },
      { key: 'order', label: 'Customer Orders' },
      { key: 'route-card', label: 'Route Cards' },
    ],
  },
  {
    key: 'job-order',
    label: 'Job Order',
    subItems: [
      { key: 'dispatch', label: 'Dispatch' },
      { key: 'receipt', label: 'Receipt' },
    ],
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    subItems: [
      { key: 'checklist', label: 'Checklist Entry' },
      { key: 'plan', label: 'Weekly Plan' },
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
    ],
  },
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
}
