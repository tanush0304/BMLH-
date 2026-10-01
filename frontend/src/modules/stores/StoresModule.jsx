import RawMaterialStoreScreen from './RawMaterialStoreScreen'
import FinishedGoodsStoreScreen from './FinishedGoodsStoreScreen'
import WipReceiptScreen from './WipReceiptScreen'
import WipIssueScreen from './WipIssueScreen'
import RawMaterialRequisitionScreen from './RawMaterialRequisitionScreen'

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
export default function StoresModule({ activeTab }) {
  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0]
  const Screen = tab.component
  return <Screen />
}
