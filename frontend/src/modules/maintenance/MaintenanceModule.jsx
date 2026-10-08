import ChecklistEntryScreen from './ChecklistEntryScreen'
import WeeklyPlanGridScreen from './WeeklyPlanGridScreen'
import ModuleLanding from '../../components/ModuleLanding'
import { landingTiles } from '../moduleLandings'
import { moduleLabel } from '../../utils/constants'

const TABS = [
  { key: 'checklist', component: ChecklistEntryScreen },
  { key: 'plan', component: WeeklyPlanGridScreen },
]

// Sub-tab selection now lives in the Sidebar's accordion (see NAV_ITEMS'
// 'maintenance' subItems) -- this just maps the active key to a screen.
export default function MaintenanceModule({ activeTab, onSelect }) {
  // No screen selected (module clicked in the sidebar / main menu): landing tiles.
  if (!activeTab) {
    return (
      <ModuleLanding
        title={moduleLabel('maintenance')}
        tiles={landingTiles('maintenance')}
        onSelect={(tile) => onSelect(tile.subKey, tile.mode)}
      />
    )
  }
  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0]
  const Screen = tab.component
  return <Screen />
}
