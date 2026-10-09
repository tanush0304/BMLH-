import RawMaterialStoreScreen from './RawMaterialStoreScreen'
import FinishedGoodsStoreScreen from './FinishedGoodsStoreScreen'
import WipReceiptScreen from './WipReceiptScreen'
import WipIssueScreen from './WipIssueScreen'
import RawMaterialRequisitionScreen from './RawMaterialRequisitionScreen'
import ModuleLanding from '../../components/ModuleLanding'
import { landingTiles } from '../moduleLandings'
import { moduleLabel } from '../../utils/constants'

const TABS = [
  { key: 'rm', component: RawMaterialStoreScreen },
  { key: 'fg', component: FinishedGoodsStoreScreen },
  { key: 'wip-receipt', component: WipReceiptScreen },
  { key: 'wip-issue', component: WipIssueScreen },
  { key: 'rm-requisition', component: RawMaterialRequisitionScreen },
]

// Sub-tab selection now lives in the Sidebar's accordion (see NAV_ITEMS'
// 'stores' subItems) -- this just maps the active key to a screen.
// WIP Receipt/Issue moved here from Production (file + nav location both),
// no logic touched -- they still call the same wip.js query layer.
// `activeMode` (from a landing tile) pre-selects the Issue/Receipt or
// Dispatch/Receipt tab of the combined RM / FG screens; keyed so picking a
// different tile for the same screen remounts it on that tab.
export default function StoresModule({ activeTab, activeMode, role, onSelect }) {
  if (!activeTab) {
    return (
      <ModuleLanding
        title={moduleLabel('stores')}
        tiles={landingTiles('stores')}
        onSelect={(tile) => onSelect(tile.subKey, tile.mode)}
      />
    )
  }
  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0]
  const Screen = tab.component
  return <Screen key={`${tab.key}/${activeMode ?? ''}`} initialMode={activeMode || undefined} role={role} />
}
