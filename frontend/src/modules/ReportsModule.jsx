import Dashboard from './Dashboard'
import CustomerPoSummaryScreen from './customerOrder/CustomerPoSummaryScreen'
import ProductionScheduleScreen from './production/ProductionScheduleScreen'
import OrderTraceabilityScreen from './production/OrderTraceabilityScreen'
import ProductionStatusScreen from './reports/ProductionStatusScreen'
import DailyMachineScreen from './reports/DailyMachineScreen'
import DowntimeScreen from './reports/DowntimeScreen'

// Reports & Dashboard: the module opens the Dashboard; its sub-screens are
// read-only reports moved here from Customer Orders and Production (files
// stay in their original folders -- see NAV_ITEMS 'dashboard' subItems)
// plus the Reports & Dashboard reports in ./reports. App lazy-loads this
// module, so Recharts stays out of the main bundle.
const TABS = [
  { key: 'po-summary', component: CustomerPoSummaryScreen },
  { key: 'schedule', component: ProductionScheduleScreen },
  { key: 'traceability', component: OrderTraceabilityScreen },
  { key: 'production-status', component: ProductionStatusScreen },
  { key: 'daily-machine', component: DailyMachineScreen },
  { key: 'downtime', component: DowntimeScreen },
]

export default function ReportsModule({ activeTab, onNavigate }) {
  const tab = TABS.find((t) => t.key === activeTab)
  if (!tab) return <Dashboard onNavigate={onNavigate} />
  const Screen = tab.component
  return <Screen />
}
