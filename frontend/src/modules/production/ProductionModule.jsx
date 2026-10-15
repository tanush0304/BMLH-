import ProductionDataEntryScreen from './ProductionDataEntryScreen'
import ManualOperationsScreen from './ManualOperationsScreen'
import ProductionPlanningScreen from './ProductionPlanningScreen'
import ProductionRouteCardScreen from './ProductionRouteCardScreen'
import ShiftVerificationScreen from './ShiftVerificationScreen'
import ModuleLanding from '../../components/ModuleLanding'
import { landingTiles } from '../moduleLandings'
import { moduleLabel, NAV_ITEMS, canSeeSubItem } from '../../utils/constants'

const TABS = [
  { key: 'production-data-entry', component: ProductionDataEntryScreen },
  { key: 'manual-operations', component: ManualOperationsScreen },
  { key: 'planning', component: ProductionPlanningScreen },
  { key: 'route-card', component: ProductionRouteCardScreen },
  { key: 'shift-verification', component: ShiftVerificationScreen },
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
        tiles={landingTiles('production', role)}
        onSelect={(tile) => onSelect(tile.subKey, tile.mode)}
      />
    )
  }
  // Role-gated screens (Production Planning, Shift Verification) fall back to
  // the first screen (Production Data Entry) for an operator.
  const subItem = NAV_ITEMS.find((n) => n.key === 'production').subItems.find((s) => s.key === activeTab)
  const allowed = !subItem || canSeeSubItem(subItem, role)
  const tab = (allowed && TABS.find((t) => t.key === activeTab)) || TABS[0]
  const Screen = tab.component
  return <Screen role={role} />
}
