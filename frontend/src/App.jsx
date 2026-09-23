import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import Sidebar from './components/Sidebar'
import ComingSoon from './components/ComingSoon'
import LoginScreen from './components/LoginScreen'
import Dashboard from './modules/Dashboard'
import MasterList from './modules/masters/MasterList'
import CustomerOrderModule from './modules/customerOrder/CustomerOrderModule'
import ProductionModule from './modules/production/ProductionModule'
import JobOrderModule from './modules/jobOrder/JobOrderModule'
import MaintenanceModule from './modules/maintenance/MaintenanceModule'
import StoresModule from './modules/stores/StoresModule'

const TITLES = {
  drawing: 'Drawing Development',
}

function App() {
  const [session, setSession] = useState(undefined) // undefined = still checking, null = signed out
  const [activeKey, setActiveKey] = useState('dashboard')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] text-gray-400 text-sm">Loading...</div>
  }

  if (!session) {
    return <LoginScreen />
  }

  let content
  if (activeKey === 'dashboard') content = <Dashboard />
  else if (activeKey === 'masters') content = <MasterList />
  else if (activeKey === 'customer-order') content = <CustomerOrderModule />
  else if (activeKey === 'production') content = <ProductionModule />
  else if (activeKey === 'job-order') content = <JobOrderModule />
  else if (activeKey === 'maintenance') content = <MaintenanceModule />
  else if (activeKey === 'stores') content = <StoresModule />
  else content = <ComingSoon title={TITLES[activeKey] ?? activeKey} />

  return (
    <div className="flex min-h-screen bg-[#F5F7FA]">
      <Sidebar
        activeKey={activeKey}
        onSelect={setActiveKey}
        userEmail={session.user.email}
        onSignOut={() => supabase.auth.signOut()}
      />
      {content}
    </div>
  )
}

export default App
