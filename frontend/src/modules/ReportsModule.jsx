import Dashboard from './Dashboard'
import CustomerPoSummaryScreen from './customerOrder/CustomerPoSummaryScreen'
import ProductionScheduleScreen from './production/ProductionScheduleScreen'
import OrderTraceabilityScreen from './production/OrderTraceabilityScreen'

// Reports & Dashboard: the module opens the Dashboard; its sub-screens are
// read-only reports moved here from Customer Orders and Production (files
// stay in their original folders -- see NAV_ITEMS 'dashboard' subItems).
const TABS = [
  { key: 'po-summary', component: CustomerPoSummaryScreen },
  { key: 'schedule', component: ProductionScheduleScreen },
  { key: 'traceability', component: OrderTraceabilityScreen },
]

export default function ReportsModule({ activeTab, onNavigate }) {
  const tab = TABS.find((t) => t.key === activeTab)
  if (!tab) return <Dashboard onNavigate={onNavigate} />
  const Screen = tab.component
  return <Screen />
}
