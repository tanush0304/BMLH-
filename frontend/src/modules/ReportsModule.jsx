import ReportLanding from '../components/reports/ReportLanding'
import { landingTiles } from './moduleLandings'
import { moduleLabel } from '../utils/constants'
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
import ComplaintStatusScreen from './reports/ComplaintStatusScreen'
import { ChartTypeProvider } from '../components/reports/ChartTypeToggle'
import ReportErrorBoundary from '../components/reports/ReportErrorBoundary'

// Reports & Dashboard: the module opens a landing with the 9 report cards
// (deck slide 18, ReportLanding); PO Summary / Production Schedule / Order Traceability (moved
// here from Customer Orders and Production, files in their original folders)
// are sidebar-only -- see NAV_ITEMS 'dashboard' subItems. App lazy-loads this
// module, so Recharts stays out of the main bundle.
const TABS = [
  { key: 'po-summary', component: CustomerPoSummaryScreen },
  { key: 'schedule', component: ProductionScheduleScreen },
  { key: 'traceability', component: OrderTraceabilityScreen },
  { key: 'production-status', component: ProductionStatusScreen, charts: true },
  { key: 'daily-machine', component: DailyMachineScreen, charts: true },
  { key: 'downtime', component: DowntimeScreen, charts: true },
  { key: 'wip-status', component: WipStatusScreen, charts: true },
  { key: 'fg-inventory', component: FgInventoryScreen, charts: true },
  { key: 'rm-status', component: RawMaterialStatusScreen, charts: true },
  { key: 'customer-order-status', component: CustomerOrderStatusScreen, charts: true },
  { key: 'job-order-status', component: JobOrderStatusScreen, charts: true },
  { key: 'quality-status', component: QualityStatusScreen, charts: true },
  { key: 'complaint-status', component: ComplaintStatusScreen, charts: true },
]

// activeMode carries a PRD into Order Traceability (Customer Order Status's
// View action); `key` remounts the screen so a new PRD is picked up.
export default function ReportsModule({ activeTab, activeMode, role, onOpenScreen }) {
  const tab = TABS.find((t) => t.key === activeTab)
  if (!tab) {
    return (
      <ReportLanding
        title={moduleLabel('dashboard')}
        tiles={landingTiles('dashboard', role)}
        onSelect={(t) => onOpenScreen?.(t.subKey, t.mode)}
      />
    )
  }
  const Screen = tab.component
  const screen = (
    <Screen
      key={activeMode ?? ''}
      initialPrdNo={activeMode ?? ''}
      onOpenTraceability={(prdNo) => onOpenScreen?.('traceability', prdNo)}
    />
  )
  // Chart pages: one Bar / Line choice for the whole page, Bar on every
  // open (keyed by tab, so it resets when another report is opened).
  const page = tab.charts ? <ChartTypeProvider key={tab.key}>{screen}</ChartTypeProvider> : screen
  // A crash shows "This report couldn't load" + Back, not a white page.
  return (
    <ReportErrorBoundary key={`${tab.key}|${activeMode ?? ''}`} reportKey={tab.key} onBack={() => onOpenScreen?.(null)}>
      {page}
    </ReportErrorBoundary>
  )
}
