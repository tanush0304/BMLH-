import JobOrderDispatchScreen from './JobOrderDispatchScreen'
import JobOrderReceiptScreen from './JobOrderReceiptScreen'

const TABS = [
  { key: 'dispatch', component: JobOrderDispatchScreen },
  { key: 'receipt', component: JobOrderReceiptScreen },
]

// Sub-tab selection now lives in the Sidebar's accordion (see NAV_ITEMS'
// 'job-order' subItems) -- this just maps the active key to a screen.
export default function JobOrderModule({ activeTab }) {
  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0]
  const Screen = tab.component
  return <Screen />
}
