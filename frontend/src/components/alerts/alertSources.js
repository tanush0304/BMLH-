import { listJobOrderStatus } from '../../data/queries/jobOrders'
import { listVendors } from '../../data/queries/vendors'
import { listJobWorkTypes } from '../../data/queries/jobWorkTypes'
import { listOrdersByPrd } from '../../data/queries/customerOrders'
import { overdueDcItems, ALERT_ROLES } from '../../utils/alerts'
import { listPoHeaders } from '../../data/queries/customerPoHeaders'
import { openPoSupported, listLineStatuses } from '../../data/queries/openPo'
import { expiredPoItems } from '../../utils/openPo'
import { jobworkQcGateSupported, loadQcGateData } from '../../data/queries/jobworkQc'
import { pendingIncomingQcItems } from '../../utils/jobworkQc'

// Add more reminders here: { key, title, roles, load, toItems(data, today) }.
export const overdueDcSource = {
  key: 'overdue-dcs',
  title: 'Jobwork DCs overdue',
  roles: ALERT_ROLES,
  async load() {
    const statusRows = await listJobOrderStatus()
    if (!statusRows.some((r) => r.is_open && r.is_overdue)) return { statusRows }
    // Names are extras: a failed lookup still lists the DC.
    const [vendors, orders, jobWorkTypes] = await Promise.all([
      listVendors().catch(() => []),
      listOrdersByPrd().catch(() => []),
      listJobWorkTypes().catch(() => []),
    ])
    return { statusRows, vendors, orders, jobWorkTypes }
  },
  toItems: (data, today) => overdueDcItems({ ...data, today }),
}

// 043: Open POs past Valid To that still have open lines. Nothing before 043.
export const expiredPoSource = {
  key: 'expired-pos',
  title: 'PO validity ended',
  roles: ALERT_ROLES,
  async load() {
    if (!(await openPoSupported())) return { headers: [], lineStatuses: [] }
    const [headers, lineStatuses] = await Promise.all([listPoHeaders(), listLineStatuses()])
    return { headers, lineStatuses }
  },
  toItems: (data, today) => expiredPoItems({ ...data, today }),
}

// 055: jobwork receipts waiting for incoming QC (none yet / latest Rejected),
// oldest first. Nothing before 055 or while the gate is off.
export const pendingIncomingQcSource = {
  key: 'pending-incoming-qc',
  title: 'Pending incoming QC',
  roles: ALERT_ROLES,
  async load() {
    if (!(await jobworkQcGateSupported())) return null
    return loadQcGateData()
  },
  toItems: (data) => (data ? pendingIncomingQcItems(data) : []),
}

export const ALERT_SOURCES = [overdueDcSource, expiredPoSource, pendingIncomingQcSource]
