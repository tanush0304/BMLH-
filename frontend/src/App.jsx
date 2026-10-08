import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import Sidebar from './components/Sidebar'
import ComingSoon from './components/ComingSoon'
import LoginScreen from './components/LoginScreen'
import Dashboard from './modules/Dashboard'
import ReportsModule from './modules/ReportsModule'
import MainMenu from './modules/MainMenu'
import MasterList from './modules/masters/MasterList'
import CustomerOrderModule from './modules/customerOrder/CustomerOrderModule'
import ProductionModule from './modules/production/ProductionModule'
import QualityModule from './modules/quality/QualityModule'
import JobOrderModule from './modules/jobOrder/JobOrderModule'
import MaintenanceModule from './modules/maintenance/MaintenanceModule'
import StoresModule from './modules/stores/StoresModule'
import { ModuleThemeProvider } from './components/ModuleTheme'
import { PageHeaderBandProvider } from './components/PageHeader'
import { getMyAppUser, createAppUser } from './data/queries/appUsers'
import { NAV_ITEMS } from './utils/constants'
import { authTransition } from './utils/authTransition'

const TITLES = {}

// Header breadcrumb (module > screen) from the same labels the sidebar shows.
function headerBreadcrumb(topKey, subKey) {
  const top = NAV_ITEMS.find((n) => n.key === topKey)
  if (!top) return []
  const sub = top.subItems?.find((s) => s.key === subKey)
  return sub ? [{ label: top.label }, { label: sub.label }] : [{ label: top.label }]
}


function App() {
  const [session, setSession] = useState(undefined) // undefined = still checking, null = signed out
  const [role, setRole] = useState(undefined) // undefined = still resolving, null = no row found
  const [activeKey, setActiveKey] = useState('dashboard')
  const [activeSubKey, setActiveSubKey] = useState(null)
  // Tab to pre-select inside a combined screen (Stores RM / FG), set by a
  // landing tile; null when a screen is opened from the sidebar.
  const [activeMode, setActiveMode] = useState(null)
  const [showMainMenu, setShowMainMenu] = useState(true)

  // Id of the signed-in user the current screen belongs to; see authTransition.
  const userIdRef = useRef(null)
  const userId = session?.user?.id ?? null

  useEffect(() => {
    function applySession(next) {
      const { userId: nextUserId, goToMainMenu } = authTransition(userIdRef.current, next)
      userIdRef.current = nextUserId
      if (goToMainMenu) setShowMainMenu(true)
      // Same user: the refreshed session is stored silently -- userId is
      // unchanged, so the role lookup below doesn't re-run.
      setSession(next)
    }
    supabase.auth.getSession().then(({ data }) => applySession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => applySession(next))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) {
      setRole(session === null ? null : undefined)
      return
    }
    let cancelled = false
    setRole(undefined)
    async function resolveRole() {
      // Every account defaults to 'operator' on first login; someone with
      // Supabase table-editor access promotes specific accounts to
      // supervisor/admin afterward.
      let appUser = await getMyAppUser(userId)
      if (!appUser) appUser = await createAppUser(userId, 'operator')
      if (!cancelled) setRole(appUser.role)
    }
    resolveRole().catch((e) => {
      console.error('Failed to resolve role', e)
      if (!cancelled) setRole('operator')
    })
    return () => {
      cancelled = true
    }
    // Keyed on the user id, not the session object: token refreshes swap the
    // session but must not re-run this. `session` is read only for the
    // still-checking (undefined) vs signed-out (null) distinction.
  }, [userId])

  // A module click (sidebar, Main Menu, Dashboard shortcuts) opens that
  // module's landing tiles -- no screen selected. Quality has no sub-screens
  // and opens directly; Reports & Dashboard opens the Dashboard.
  function handleSelect(key) {
    setShowMainMenu(false)
    setActiveKey(key)
    setActiveSubKey(null)
    setActiveMode(null)
  }

  function handleSelectSub(topKey, subKey, mode = null) {
    setShowMainMenu(false)
    setActiveKey(topKey)
    setActiveSubKey(subKey)
    setActiveMode(mode)
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
  if (activeKey === 'dashboard') content = <ReportsModule activeTab={activeSubKey} onNavigate={handleSelect} />
  else if (activeKey === 'masters' && canSeeMasters) content = <MasterList activeTab={activeSubKey} onSelect={(subKey) => handleSelectSub('masters', subKey)} />
  else if (activeKey === 'masters') {
    content = <Dashboard />
    themeKey = 'dashboard'
  } else if (activeKey === 'customer-order') content = <CustomerOrderModule activeTab={activeSubKey} onSelect={(subKey) => handleSelectSub('customer-order', subKey)} />
  else if (activeKey === 'production') content = <ProductionModule activeTab={activeSubKey} role={role} onSelect={(subKey) => handleSelectSub('production', subKey)} />
  else if (activeKey === 'quality') content = <QualityModule />
  else if (activeKey === 'job-order') content = <JobOrderModule activeTab={activeSubKey} onSelect={(subKey) => handleSelectSub('job-order', subKey)} />
  else if (activeKey === 'maintenance') content = <MaintenanceModule activeTab={activeSubKey} onSelect={(subKey) => handleSelectSub('maintenance', subKey)} />
  else if (activeKey === 'stores') content = (
      <StoresModule
        activeTab={activeSubKey}
        activeMode={activeMode}
        onSelect={(subKey, mode) => handleSelectSub('stores', subKey, mode)}
      />
    )
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
      <ModuleThemeProvider module={themeKey}>
        <PageHeaderBandProvider breadcrumb={headerBreadcrumb(themeKey, activeSubKey)}>{content}</PageHeaderBandProvider>
      </ModuleThemeProvider>
    </div>
  )
}

export default App
