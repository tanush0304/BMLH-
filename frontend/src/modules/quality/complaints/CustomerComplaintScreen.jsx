import { useState } from 'react'
import PageHeader from '../../../components/PageHeader'
import ComplaintRegistrationScreen from './ComplaintRegistrationScreen'
import ComplaintInvestigationScreen from './ComplaintInvestigationScreen'

const TABS = [
  { key: 'registration', label: 'Registration' },
  { key: 'investigation', label: 'Investigation & Closure' },
]

/** Customer Complaint -- one screen with Registration / Investigation &
 * Closure tabs (same pattern as Stores RM / FG). A Complaint List row click
 * on Registration switches to Investigation with that complaint open. */
export default function CustomerComplaintScreen({ initialMode = 'registration', role }) {
  const [mode, setMode] = useState(initialMode)
  const [openComplaintNo, setOpenComplaintNo] = useState(null)

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader eyebrow="Quality Module" title="Customer Complaint" subtitle="Capture  |  Investigate  |  Resolve  |  Close" />

      <div className="flex items-center gap-1 bg-white border-b border-gray-200 px-6 pt-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setMode(t.key)
              setOpenComplaintNo(null)
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              mode === t.key ? 'border-bmlhnavy text-bmlhnavy' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === 'registration' ? (
        <ComplaintRegistrationScreen
          onOpenComplaint={(complaintNo) => {
            setOpenComplaintNo(complaintNo)
            setMode('investigation')
          }}
        />
      ) : (
        <ComplaintInvestigationScreen role={role} initialComplaintNo={openComplaintNo ?? undefined} />
      )}
    </div>
  )
}
