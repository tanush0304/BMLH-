import { useEffect, useState } from 'react'
import { Route } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, SelectInput, AutoFillBox } from '../../components/FormSection'
import { listProducts } from '../../data/queries/products'
import { listCycleTimes } from '../../data/queries/cycleTimes'
import { listJobWorkTypes } from '../../data/queries/jobWorkTypes'
import { listMachines } from '../../data/queries/machines'
import { TEMPLATE_COLUMNS, templateRow } from '../../utils/jobRouteCard'

/** Masters > Route Card: the per-part route template, read straight from
 * Cycle Time Master (the same rows Production Planning snapshots into a
 * PRD's Job Route Card on submit). Read-only -- edit routes in Cycle Time
 * Master. An Internal operation runnable on several machines shows one row
 * per machine, as it is stored. */
export default function RouteCardScreen() {
  const [products, setProducts] = useState([])
  const [cycleTimes, setCycleTimes] = useState([])
  const [jobWorkTypes, setJobWorkTypes] = useState([])
  const [machines, setMachines] = useState([])
  const [partSerialNumber, setPartSerialNumber] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([listProducts(), listCycleTimes(), listJobWorkTypes(), listMachines()])
      .then(([productRows, cycleRows, jobWorkRows, machineRows]) => {
        setProducts(productRows)
        setCycleTimes(cycleRows)
        setJobWorkTypes(jobWorkRows)
        setMachines(machineRows)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const partsWithRoute = new Set(cycleTimes.map((r) => r.part_serial_number))
  const partOptions = products
    .filter((p) => partsWithRoute.has(p.part_serial_number))
    .map((p) => ({ value: p.part_serial_number, label: `${p.part_serial_number} – ${p.part_name ?? ''}` }))
  const product = products.find((p) => p.part_serial_number === partSerialNumber)
  const rows = cycleTimes
    .filter((r) => r.part_serial_number === partSerialNumber)
    .sort((a, b) => a.seq - b.seq || String(a.machine_id ?? '').localeCompare(String(b.machine_id ?? '')))
    .map((r) => ({ id: r.id, seq: r.seq, ...templateRow(r, jobWorkTypes, machines) }))

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="Route Card" subtitle="Route Template Per Part | From Cycle Time Master" />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">{error}</div>}

        <FormSection icon={Route} title="1. Part" subtitle="Pick a part to see its route template" columns={3}>
          <Field label="Part Serial Number" required>
            <SelectInput
              value={partSerialNumber}
              onChange={(e) => setPartSerialNumber(e.target.value)}
              options={partOptions}
              disabled={loading}
            />
          </Field>
          <Field label="Part Name">
            <AutoFillBox value={product?.part_name ?? ''} />
          </Field>
          <Field label="Drawing Reference Number">
            <AutoFillBox value={product?.part_drawing_reference_number ?? ''} />
          </Field>
        </FormSection>

        {partSerialNumber && (
          <section className="rounded-xl border border-[#D5E3F4] bg-white p-3 shadow-sm">
            <div className="mb-2 text-[13px] font-semibold text-[#0B2A5B]">2. Route Template</div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr>
                    <th className="border border-slate-400 bg-[#FFF2B3] px-2 py-1.5 text-left font-semibold text-slate-800">Seq</th>
                    {TEMPLATE_COLUMNS.map((c) => (
                      <th key={c.key} className="border border-slate-400 bg-[#FFF2B3] px-2 py-1.5 text-left font-semibold text-slate-800">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="bg-[#FFF8D6]">
                      <td className="border border-slate-400 px-2 py-1.5">{r.seq}</td>
                      {TEMPLATE_COLUMNS.map((c) => (
                        <td key={c.key} className="border border-slate-400 px-2 py-1.5 text-slate-900">
                          {r[c.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
