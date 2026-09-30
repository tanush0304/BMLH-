import { useState } from 'react'
import CustomerEnquiryScreen from './CustomerEnquiryScreen'
import CustomerOrderScreen from './CustomerOrderScreen'
import RouteCardScreen from './RouteCardScreen'

const TABS = [
  { key: 'enquiry', label: 'Customer Enquiries', component: CustomerEnquiryScreen },
  { key: 'order', label: 'Customer Orders', component: CustomerOrderScreen },
  { key: 'route-card', label: 'Route Cards', component: RouteCardScreen },
]

export default function CustomerOrderModule() {
  const [active, setActive] = useState('enquiry')
  const tab = TABS.find((t) => t.key === active)
  const Screen = tab.component

  return (
    <div className="flex-1 flex min-w-0 min-h-0">
      <div className="w-52 shrink-0 bg-white border-r border-gray-200 py-3 overflow-y-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`w-full text-left px-4 py-2.5 text-sm border-l-4 ${
              active === t.key
                ? 'border-bmlhnavy bg-bmlhsky text-bmlhnavy font-medium'
                : 'border-transparent text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <Screen />
      </div>
    </div>
  )
}
