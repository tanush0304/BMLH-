import { useEffect, useState } from 'react'
import { ClipboardList, Hourglass, AlertTriangle } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatTile from '../components/StatTile'
import { countOpenOrders, countPendingStages, countOverdueJobOrders } from '../data/queries/dashboard'

export default function Dashboard({ onNavigate }) {
  const [counts, setCounts] = useState({ openOrders: null, pendingStages: null, overdueJobOrders: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [openOrders, pendingStages, overdueJobOrders] = await Promise.all([
          countOpenOrders(),
          countPendingStages(),
          countOverdueJobOrders(),
        ])
        setCounts({ openOrders, pendingStages, overdueJobOrders })
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader title="Dashboard" subtitle="Overview of shop-floor operations" />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatTile
            label="Open orders"
            value={counts.openOrders}
            icon={ClipboardList}
            accent="text-bmlhblue"
            loading={loading}
            onClick={() => onNavigate?.('customer-order')}
          />
          <StatTile
            label="Pending stages"
            value={counts.pendingStages}
            icon={Hourglass}
            accent="text-amber-600"
            loading={loading}
            onClick={() => onNavigate?.('production')}
          />
          <StatTile
            label="Overdue job orders"
            value={counts.overdueJobOrders}
            icon={AlertTriangle}
            accent="text-red-600"
            loading={loading}
            onClick={() => onNavigate?.('job-order')}
          />
        </div>
      </div>
    </div>
  )
}
