import { useEffect, useMemo, useState } from 'react'
import { Route, ListTree } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import RecordsList from '../../components/RecordsList'
import { listCustomerOrders } from '../../data/queries/customerOrders'
import { listRouteCards, getStagesForPrd, generateRouteCard } from '../../data/queries/routeCards'
import { listProductionBatches } from '../../data/queries/productionBatch'

const CARD_COLUMNS = [
  { key: 'prd_no', label: 'PRD No' },
  { key: 'batch_qty', label: 'Batch Qty' },
  { key: 'shift_hours', label: 'Shift Hours' },
  { key: 'planned_date', label: 'Planned Date' },
]

const STAGE_COLUMNS = [
  { key: 'seq', label: 'Seq' },
  { key: 'operation', label: 'Operation' },
  { key: 'type', label: 'Type' },
  { key: 'machine_id', label: 'Machine ID' },
  { key: 'job_work_code', label: 'Job Work Code' },
  { key: 'cycle_time_min', label: 'Cycle Time (min)' },
  { key: 'status', label: 'Status', type: 'status' },
]

export default function RouteCardScreen() {
  const [orders, setOrders] = useState([])
  const [routeCards, setRouteCards] = useState([])
  const [productionBatches, setProductionBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [selectedPrd, setSelectedPrd] = useState('')
  const [batchQty, setBatchQty] = useState('')
  const [shiftHours, setShiftHours] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)

  const [viewedCardPrd, setViewedCardPrd] = useState('')
  const [stages, setStages] = useState([])
  const [stagesLoading, setStagesLoading] = useState(false)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [ords, cards, batches] = await Promise.all([
        listCustomerOrders(),
        listRouteCards(),
        listProductionBatches(),
      ])
      setOrders(ords)
      setRouteCards(cards)
      setProductionBatches(batches)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const ordersWithoutCard = useMemo(() => {
    const cardedPrds = new Set(routeCards.map((c) => c.prd_no))
    return orders.filter((o) => !cardedPrds.has(o.prd_no))
  }, [orders, routeCards])

  const selectedOrder = orders.find((o) => o.prd_no === selectedPrd)

  function handleSelectPrd(e) {
    const prd = e.target.value
    setSelectedPrd(prd)
    setGenerateError(null)
    const order = orders.find((o) => o.prd_no === prd)
    const defaultBatch = productionBatches.find((b) => b.product_code === order?.product_code)
    setBatchQty(defaultBatch?.production_batch_quantity ?? '')
    setShiftHours('')
  }

  async function handleGenerate() {
    if (!selectedPrd || !selectedOrder) {
      setGenerateError('Choose a Customer Order to generate a route card for.')
      return
    }
    setGenerating(true)
    setGenerateError(null)
    try {
      await generateRouteCard({
        prdNo: selectedPrd,
        productCode: selectedOrder.product_code,
        batchQty,
        shiftHours,
      })
      setSelectedPrd('')
      setBatchQty('')
      setShiftHours('')
      await refresh()
    } catch (e) {
      setGenerateError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleViewCard(row) {
    setViewedCardPrd(row.prd_no)
    setStagesLoading(true)
    try {
      setStages(await getStagesForPrd(row.prd_no))
    } catch (e) {
      setGenerateError(e.message)
    } finally {
      setStagesLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader
        title="Production Route Cards"
        subtitle="Generate From Cycle Time Master  |  Frozen Snapshot Per Order"
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#F5F7FA]">
        {(error || generateError) && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error ?? generateError}
          </div>
        )}

        <FormSection icon={Route} title="1. Generate Route Card" columns={3}>
          <Field label="Customer Order (PRD No)" required>
            <SelectInput
              value={selectedPrd}
              onChange={handleSelectPrd}
              options={ordersWithoutCard.map((o) => o.prd_no)}
            />
          </Field>
          <Field label="Product">
            <TextInput value={selectedOrder?.product_code ?? ''} disabled />
          </Field>
          <Field label="Order Qty">
            <TextInput value={selectedOrder?.order_qty ?? ''} disabled />
          </Field>
          <Field label="Batch Qty">
            <TextInput type="number" value={batchQty} onChange={(e) => setBatchQty(e.target.value)} />
          </Field>
          <Field label="Shift Hours">
            <TextInput type="number" value={shiftHours} onChange={(e) => setShiftHours(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <button
              onClick={handleGenerate}
              disabled={generating || !selectedPrd}
              className="bg-green-600 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-green-700"
            >
              {generating ? 'Generating...' : 'Generate Route Card'}
            </button>
          </div>
          {ordersWithoutCard.length === 0 && !loading && (
            <p className="text-sm text-gray-400 sm:col-span-3">
              Every customer order already has a route card.
            </p>
          )}
        </FormSection>

        <RecordsList
          title="Route Cards"
          columns={CARD_COLUMNS}
          rows={routeCards}
          loading={loading}
          error={null}
          rowKey="prd_no"
          selectedKey={viewedCardPrd}
          onRowClick={handleViewCard}
        />

        {viewedCardPrd && (
          <RecordsList
            title={`Stages for ${viewedCardPrd}`}
            columns={STAGE_COLUMNS}
            rows={stages}
            loading={stagesLoading}
            error={null}
            rowKey="id"
          />
        )}
      </div>
    </div>
  )
}
