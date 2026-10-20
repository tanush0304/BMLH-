import QualityInspectionScreen from './QualityInspectionScreen'
import CustomerComplaintScreen from './complaints/CustomerComplaintScreen'
import ModuleLanding from '../../components/ModuleLanding'
import { landingTiles } from '../moduleLandings'
import { moduleLabel } from '../../utils/constants'

// Sub-screen selection lives in the Sidebar's accordion (NAV_ITEMS 'quality'
// subItems). Customer Complaint is one screen with Registration /
// Investigation & Closure tabs; `activeMode` pre-selects a tab.
export default function QualityModule({ activeTab, activeMode, role, onSelect }) {
  if (!activeTab) {
    return (
      <ModuleLanding
        title={moduleLabel('quality')}
        tiles={landingTiles('quality')}
        onSelect={(tile) => onSelect(tile.subKey, tile.mode)}
      />
    )
  }
  if (activeTab === 'complaint') {
    return <CustomerComplaintScreen key={activeMode ?? ''} initialMode={activeMode || undefined} role={role} />
  }
  return <QualityInspectionScreen role={role} />
}
