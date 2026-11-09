import { listJobOrderStatus } from '../../data/queries/jobOrders'
import { listVendors } from '../../data/queries/vendors'
import { listJobWorkTypes } from '../../data/queries/jobWorkTypes'
import { listOrdersByPrd } from '../../data/queries/customerOrders'
import { overdueDcItems, ALERT_ROLES } from '../../utils/alerts'

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

export const ALERT_SOURCES = [overdueDcSource]
