import JobOrderDispatchScreen from './JobOrderDispatchScreen'
import JobOrderReceiptScreen from './JobOrderReceiptScreen'
import ModuleLanding from '../../components/ModuleLanding'
import { landingTiles } from '../moduleLandings'
import { moduleLabel } from '../../utils/constants'
import { dcFromMode } from '../../utils/alerts'

const TABS = [
  { key: 'dispatch', component: JobOrderDispatchScreen },
  { key: 'receipt', component: JobOrderReceiptScreen },
]

// Sub-tab selection now lives in the Sidebar's accordion (see NAV_ITEMS'
// 'job-order' subItems) -- this just maps the active key to a screen.
export default function JobOrderModule({ activeTab, activeMode, role, onSelect }) {
  // No screen selected (module clicked in the sidebar / main menu): landing tiles.
  if (!activeTab) {
    return (
      <ModuleLanding
        title={moduleLabel('job-order')}
        tiles={landingTiles('job-order')}
        onSelect={(tile) => onSelect(tile.subKey, tile.mode)}
      />
    )
  }
  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0]
  const Screen = tab.component
  // "Needs attention" Open -> Receipt with that DC (mode 'dc:DC-004').
  return <Screen role={role} initialDcNo={tab.key === 'receipt' ? dcFromMode(activeMode) : null} />
}
