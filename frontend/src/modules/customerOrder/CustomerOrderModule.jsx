import CustomerEnquiryScreen from './CustomerEnquiryScreen'
import CustomerOrderScreen from './CustomerOrderScreen'
import ModuleLanding from '../../components/ModuleLanding'
import { landingTiles } from '../moduleLandings'
import { moduleLabel } from '../../utils/constants'

const TABS = [
  { key: 'enquiry', component: CustomerEnquiryScreen },
  { key: 'order', component: CustomerOrderScreen },
]

// Sub-tab selection now lives in the Sidebar's accordion (see NAV_ITEMS'
// 'customer-order' subItems) -- this just maps the active key to a screen.
export default function CustomerOrderModule({ activeTab, activeMode, role, onSelect }) {
  // No screen selected (module clicked in the sidebar / main menu): landing tiles.
  if (!activeTab) {
    return (
      <ModuleLanding
        title={moduleLabel('customer-order')}
        tiles={landingTiles('customer-order')}
        onSelect={(tile) => onSelect(tile.subKey, tile.mode)}
      />
    )
  }
  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0]
  const Screen = tab.component
  // New Order takes the bell's "po:<id>" mode (open that PO) and the role (043 actions).
  return <Screen initialMode={activeMode} role={role} />
}
