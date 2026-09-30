import { useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import RecordsList from '../../components/RecordsList'
import { supabase } from '../../lib/supabaseClient'

const COLUMNS = [
  { key: 'prd_no', label: 'PRD No' },
  { key: 'seq', label: 'Seq' },
  { key: 'operation', label: 'Operation' },
  { key: 'type', label: 'Type' },
  { key: 'machine_id', label: 'Machine ID' },
  { key: 'job_work_code', label: 'Job Work Code' },
  { key: 'status', label: 'Status', type: 'status' },
  { key: 'actual_date', label: 'Actual Date' },
]

export default function ProductionScheduleScreen() {
  const [stages, setStages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data, error } = await supabase
          .from('production route card stages')
          .select('*')
          .order('prd_no')
          .order('seq')
        if (error) throw error
        setStages(data)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = stages.filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.prd_no?.toLowerCase().includes(q) || s.operation?.toLowerCase().includes(q)
  })

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Production Schedule" subtitle="Every Route Card Stage, Across All Orders" />
      <ActionToolbar
        showCrudButtons={false}
        searchValue={search}
        onSearchChange={setSearch}
        onSearch={() => {}}
        searchPlaceholder="Search by PRD No / Operation..."
        showExport={false}
      />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        <RecordsList
          title="Route Card Stages"
          columns={COLUMNS}
          rows={filtered}
          loading={loading}
          error={error}
          rowKey="id"
        />
      </div>
    </div>
  )
}
