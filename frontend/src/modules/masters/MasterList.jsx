import { useState } from 'react'
import CustomerMaster from './CustomerMaster'
import ComingSoon from '../../components/ComingSoon'

const ENTITIES = [
  { key: 'product', label: 'Product Master' },
  { key: 'machine', label: 'Machine Master' },
  { key: 'job-work', label: 'Job Work Master' },
  { key: 'cycle-time', label: 'Cycle Time Master' },
  { key: 'customer', label: 'Customer Master' },
  { key: 'raw-material', label: 'Raw Material Master' },
  { key: 'supplier', label: 'Supplier Master' },
  { key: 'shift', label: 'Shift Master' },
  { key: 'operator', label: 'Operator Master' },
  { key: 'vendor', label: 'Vendor Master' },
  { key: 'quality', label: 'Quality Master' },
  { key: 'maintenance', label: 'Maintenance Master' },
  { key: 'production-batch', label: 'Production Batch Master' },
]

export default function MasterList() {
  const [active, setActive] = useState('customer')

  return (
    <div className="flex-1 flex min-w-0">
      <div className="w-52 shrink-0 bg-white border-r border-gray-200 py-3 overflow-y-auto">
        {ENTITIES.map((e) => (
          <button
            key={e.key}
            onClick={() => setActive(e.key)}
            className={`w-full text-left px-4 py-2.5 text-sm border-l-4 ${
              active === e.key
                ? 'border-bmlhblue bg-sky-50 text-bmlhblue font-medium'
                : 'border-transparent text-gray-600 hover:bg-gray-50'
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        {active === 'customer' ? (
          <CustomerMaster />
        ) : (
          <ComingSoon
            title={ENTITIES.find((e) => e.key === active)?.label}
            subtitle="Manage master data"
          />
        )}
      </div>
    </div>
  )
}
