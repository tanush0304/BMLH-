import ProductionDataEntryScreen from './ProductionDataEntryScreen'
import ManualOperationsScreen from './ManualOperationsScreen'
import ProductionPlanningScreen from './ProductionPlanningScreen'
import ProductionRouteCardScreen from './ProductionRouteCardScreen'
import ModuleLanding from '../../components/ModuleLanding'
import { landingTiles } from '../moduleLandings'
import { moduleLabel } from '../../utils/constants'

const TABS = [
  { key: 'production-data-entry', component: ProductionDataEntryScreen },
  { key: 'manual-operations', component: ManualOperationsScreen },
  { key: 'planning', component: ProductionPlanningScreen },
  { key: 'route-card', component: ProductionRouteCardScreen },
]

// Sub-tab selection now lives in the Sidebar's accordion (see NAV_ITEMS'
// 'production' subItems) -- this just maps the active key to a screen.
// WIP Receipt/Issue moved to the Stores module (see StoresModule.jsx).
export default function ProductionModule({ activeTab, role, onSelect }) {
  // No screen selected (module clicked in the sidebar / main menu): landing tiles.
  if (!activeTab) {
    return (
      <ModuleLanding
        title={moduleLabel('production')}
        tiles={landingTiles('production')}
        onSelect={(tile) => onSelect(tile.subKey, tile.mode)}
      />
    )
  }
  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0]
  const Screen = tab.component
  return <Screen role={role} />
}
