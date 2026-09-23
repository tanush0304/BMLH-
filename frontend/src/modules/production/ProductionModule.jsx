import { useState } from 'react'
import MachineEntryScreen from './MachineEntryScreen'
import ProductionScheduleScreen from './ProductionScheduleScreen'
import OrderTraceabilityScreen from './OrderTraceabilityScreen'

const TABS = [
  { key: 'machine-entry', label: 'Machine Entry', component: MachineEntryScreen },
  { key: 'schedule', label: 'Production Schedule', component: ProductionScheduleScreen },
  { key: 'traceability', label: 'Order Traceability', component: OrderTraceabilityScreen },
]

export default function ProductionModule() {
  const [active, setActive] = useState('machine-entry')
  const tab = TABS.find((t) => t.key === active)
  const Screen = tab.component

  return (
    <div className="flex-1 flex min-w-0">
      <div className="w-52 shrink-0 bg-white border-r border-gray-200 py-3 overflow-y-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`w-full text-left px-4 py-2.5 text-sm border-l-4 ${
              active === t.key
                ? 'border-bmlhblue bg-sky-50 text-bmlhblue font-medium'
                : 'border-transparent text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <Screen />
      </div>
    </div>
  )
}
