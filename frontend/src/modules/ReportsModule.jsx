import Dashboard from './Dashboard'
import CustomerPoSummaryScreen from './customerOrder/CustomerPoSummaryScreen'
import ProductionScheduleScreen from './production/ProductionScheduleScreen'
import OrderTraceabilityScreen from './production/OrderTraceabilityScreen'
import ProductionStatusScreen from './reports/ProductionStatusScreen'
import DailyMachineScreen from './reports/DailyMachineScreen'
import DowntimeScreen from './reports/DowntimeScreen'
import WipStatusScreen from './reports/WipStatusScreen'
import FgInventoryScreen from './reports/FgInventoryScreen'
import RawMaterialStatusScreen from './reports/RawMaterialStatusScreen'
import CustomerOrderStatusScreen from './reports/CustomerOrderStatusScreen'
import JobOrderStatusScreen from './reports/JobOrderStatusScreen'
import QualityStatusScreen from './reports/QualityStatusScreen'

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
  { key: 'wip-status', component: WipStatusScreen },
  { key: 'fg-inventory', component: FgInventoryScreen },
  { key: 'rm-status', component: RawMaterialStatusScreen },
  { key: 'customer-order-status', component: CustomerOrderStatusScreen },
  { key: 'job-order-status', component: JobOrderStatusScreen },
  { key: 'quality-status', component: QualityStatusScreen },
]

// activeMode carries a PRD into Order Traceability (Customer Order Status's
// View action); `key` remounts the screen so a new PRD is picked up.
export default function ReportsModule({ activeTab, activeMode, onNavigate, onOpenScreen }) {
  const tab = TABS.find((t) => t.key === activeTab)
  if (!tab) return <Dashboard onNavigate={onNavigate} />
  const Screen = tab.component
  return (
    <Screen
      key={activeMode ?? ''}
      initialPrdNo={activeMode ?? ''}
      onOpenTraceability={(prdNo) => onOpenScreen?.('traceability', prdNo)}
    />
  )
}
