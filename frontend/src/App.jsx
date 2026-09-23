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
import { getMyAppUser, createAppUser } from './data/queries/appUsers'

const TITLES = {
  drawing: 'Drawing Development',
}

function App() {
  const [session, setSession] = useState(undefined) // undefined = still checking, null = signed out
  const [role, setRole] = useState(undefined) // undefined = still resolving, null = no row found
  const [activeKey, setActiveKey] = useState('dashboard')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setRole(session === null ? null : undefined)
      return
    }
    let cancelled = false
    setRole(undefined)
    async function resolveRole() {
      // Every account defaults to 'operator' on first login; someone with
      // Supabase table-editor access promotes specific accounts to
      // supervisor/admin afterward.
      let appUser = await getMyAppUser(session.user.id)
      if (!appUser) appUser = await createAppUser(session.user.id, 'operator')
      if (!cancelled) setRole(appUser.role)
    }
    resolveRole().catch((e) => {
      console.error('Failed to resolve role', e)
      if (!cancelled) setRole('operator')
    })
    return () => {
      cancelled = true
    }
  }, [session])

  if (session === undefined) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] text-gray-400 text-sm">Loading...</div>
  }

  if (!session) {
    return <LoginScreen />
  }

  if (role === undefined) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] text-gray-400 text-sm">Loading...</div>
  }

  const canSeeMasters = role === 'supervisor' || role === 'admin'

  let content
  if (activeKey === 'dashboard') content = <Dashboard />
  else if (activeKey === 'masters' && canSeeMasters) content = <MasterList />
  else if (activeKey === 'masters') content = <Dashboard />
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
        role={role}
      />
      {content}
    </div>
  )
}

export default App
