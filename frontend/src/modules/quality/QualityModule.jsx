import QualityInspectionScreen from './QualityInspectionScreen'
import ComplaintRegistrationScreen from './complaints/ComplaintRegistrationScreen'
import ComplaintInvestigationScreen from './complaints/ComplaintInvestigationScreen'
import ModuleLanding from '../../components/ModuleLanding'
import { landingTiles } from '../moduleLandings'
import { moduleLabel } from '../../utils/constants'

// Sub-screen selection lives in the Sidebar's accordion (NAV_ITEMS 'quality'
// subItems). `activeMode` carries a complaint_no when a Complaint List row
// opens it in Investigation & Closure.
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
  if (activeTab === 'complaint-registration') {
    return <ComplaintRegistrationScreen onOpenComplaint={(complaintNo) => onSelect('complaint-investigation', complaintNo)} />
  }
  if (activeTab === 'complaint-investigation') {
    return <ComplaintInvestigationScreen role={role} initialComplaintNo={activeMode} />
  }
  return <QualityInspectionScreen />
}
