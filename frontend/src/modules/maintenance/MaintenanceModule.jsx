import ChecklistEntryScreen from './ChecklistEntryScreen'
import WeeklyPlanGridScreen from './WeeklyPlanGridScreen'

const TABS = [
  { key: 'checklist', component: ChecklistEntryScreen },
  { key: 'plan', component: WeeklyPlanGridScreen },
]

// Sub-tab selection now lives in the Sidebar's accordion (see NAV_ITEMS'
// 'maintenance' subItems) -- this just maps the active key to a screen.
export default function MaintenanceModule({ activeTab }) {
  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0]
  const Screen = tab.component
  return <Screen />
}
