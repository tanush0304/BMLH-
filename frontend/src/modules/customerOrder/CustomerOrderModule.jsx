import CustomerEnquiryScreen from './CustomerEnquiryScreen'
import CustomerOrderScreen from './CustomerOrderScreen'
import CustomerPoSummaryScreen from './CustomerPoSummaryScreen'
import RouteCardScreen from './RouteCardScreen'

const TABS = [
  { key: 'enquiry', component: CustomerEnquiryScreen },
  { key: 'order', component: CustomerOrderScreen },
  { key: 'po-summary', component: CustomerPoSummaryScreen },
  { key: 'route-card', component: RouteCardScreen },
]

// Sub-tab selection now lives in the Sidebar's accordion (see NAV_ITEMS'
// 'customer-order' subItems) -- this just maps the active key to a screen.
export default function CustomerOrderModule({ activeTab }) {
  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0]
  const Screen = tab.component
  return <Screen />
}
