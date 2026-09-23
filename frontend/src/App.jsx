import { useState } from 'react'
import Sidebar from './components/Sidebar'
import ComingSoon from './components/ComingSoon'
import Dashboard from './modules/Dashboard'
import MasterList from './modules/masters/MasterList'
import CustomerOrderModule from './modules/customerOrder/CustomerOrderModule'

const TITLES = {
  drawing: 'Drawing Development',
  production: 'Production',
  'job-order': 'Job Order',
  maintenance: 'Maintenance',
  stores: 'Stores',
}

function App() {
  const [activeKey, setActiveKey] = useState('dashboard')

  let content
  if (activeKey === 'dashboard') content = <Dashboard />
  else if (activeKey === 'masters') content = <MasterList />
  else if (activeKey === 'customer-order') content = <CustomerOrderModule />
  else content = <ComingSoon title={TITLES[activeKey] ?? activeKey} />

  return (
    <div className="flex min-h-screen bg-[#F5F7FA]">
      <Sidebar activeKey={activeKey} onSelect={setActiveKey} />
      {content}
    </div>
  )
}

export default App
