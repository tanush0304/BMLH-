import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import Sidebar from './components/Sidebar'
import ComingSoon from './components/ComingSoon'
import LoginScreen from './components/LoginScreen'
import Dashboard from './modules/Dashboard'
import MainMenu from './modules/MainMenu'
import MasterList from './modules/masters/MasterList'
import CustomerOrderModule from './modules/customerOrder/CustomerOrderModule'
import ProductionModule from './modules/production/ProductionModule'
import QualityModule from './modules/quality/QualityModule'
import JobOrderModule from './modules/jobOrder/JobOrderModule'
import MaintenanceModule from './modules/maintenance/MaintenanceModule'
import StoresModule from './modules/stores/StoresModule'
import { ModuleThemeProvider } from './components/ModuleTheme'
import { getMyAppUser, createAppUser } from './data/queries/appUsers'
import { NAV_ITEMS } from './utils/constants'

const TITLES = {}

function firstSubKey(topKey) {
  // Masters opens its module selector first; other modules keep their default.
  if (topKey === 'masters') return null
  return NAV_ITEMS.find((n) => n.key === topKey)?.subItems?.[0]?.key ?? null
}

function App() {
  const [session, setSession] = useState(undefined) // undefined = still checking, null = signed out
  const [role, setRole] = useState(undefined) // undefined = still resolving, null = no row found
  const [activeKey, setActiveKey] = useState('dashboard')
  const [activeSubKey, setActiveSubKey] = useState(null)
  const [showMainMenu, setShowMainMenu] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setShowMainMenu(true)
      setSession(session)
    })
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

  // Used by the Sidebar for leaf top-level items (Dashboard, Quality) and by
  // Dashboard's own shortcut buttons, which only know the top-level key --
  // default to that module's first sub-item so there's always something to
  // show.
  function handleSelect(key) {
    setShowMainMenu(false)
    setActiveKey(key)
    setActiveSubKey(firstSubKey(key))
  }

  function handleSelectSub(topKey, subKey) {
    setShowMainMenu(false)
    setActiveKey(topKey)
    setActiveSubKey(subKey)
  }

  function handleHome() {
    setShowMainMenu(true)
  }

  if (session === undefined) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] text-gray-400 text-sm">Loading...</div>
  }

  if (!session) {
    return <LoginScreen />
  }

  if (role === undefined) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] text-gray-400 text-sm">Loading...</div>
  }

  if (showMainMenu) {
    return <MainMenu userEmail={session.user.email} role={role} onNavigate={handleSelect} onSignOut={() => supabase.auth.signOut()} />
  }

  const canSeeMasters = role === 'supervisor' || role === 'admin'

  let content
  let themeKey = activeKey
  if (activeKey === 'dashboard') content = <Dashboard onNavigate={handleSelect} />
  else if (activeKey === 'masters' && canSeeMasters) content = <MasterList activeTab={activeSubKey} onSelect={(subKey) => handleSelectSub('masters', subKey)} />
  else if (activeKey === 'masters') {
    content = <Dashboard />
    themeKey = 'dashboard'
  } else if (activeKey === 'customer-order') content = <CustomerOrderModule activeTab={activeSubKey} />
  else if (activeKey === 'production') content = <ProductionModule activeTab={activeSubKey} />
  else if (activeKey === 'quality') content = <QualityModule />
  else if (activeKey === 'job-order') content = <JobOrderModule activeTab={activeSubKey} />
  else if (activeKey === 'maintenance') content = <MaintenanceModule activeTab={activeSubKey} />
  else if (activeKey === 'stores') content = <StoresModule activeTab={activeSubKey} />
  else content = <ComingSoon title={TITLES[activeKey] ?? activeKey} />

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F7FA]">
      <Sidebar
        activeKey={activeKey}
        activeSubKey={activeSubKey}
        onSelect={handleSelect}
        onSelectSub={handleSelectSub}
        onHome={handleHome}
        userEmail={session.user.email}
        onSignOut={() => supabase.auth.signOut()}
        role={role}
      />
      <ModuleThemeProvider module={themeKey}>{content}</ModuleThemeProvider>
    </div>
  )
}

export default App
