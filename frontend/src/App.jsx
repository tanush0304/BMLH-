import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import Sidebar from './components/Sidebar'
import ComingSoon from './components/ComingSoon'
import LoginScreen from './components/LoginScreen'
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
import { NAV_ITEMS, isModuleRestricted } from './utils/constants'
import { authTransition } from './utils/authTransition'

// Lazy: Reports pulls in Recharts, which the other modules don't need.
const ReportsModule = lazy(() => import('./modules/ReportsModule'))

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

  // A module click (sidebar, Main Menu) opens that module's landing tiles --
  // no screen selected.
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
    return <MainMenu role={role} onNavigate={handleSelect} onSignOut={() => supabase.auth.signOut()} />
  }

  // Modules with `roles` in NAV_ITEMS (Masters, Reports & Dashboard) are
  // supervisor/admin only; anyone else who reaches one gets a notice.
  const restricted = isModuleRestricted(activeKey, role)

  let content
  const themeKey = activeKey
  if (restricted) content = <ComingSoon title={NAV_ITEMS.find((item) => item.key === activeKey).label} subtitle="Supervisor or admin access required." />
  else if (activeKey === 'dashboard') content = <ReportsModule activeTab={activeSubKey} activeMode={activeMode} role={role} onOpenScreen={(subKey, mode) => handleSelectSub('dashboard', subKey, mode)} />
  else if (activeKey === 'masters') content = <MasterList activeTab={activeSubKey} onSelect={(subKey) => handleSelectSub('masters', subKey)} />
  else if (activeKey === 'customer-order') content = <CustomerOrderModule activeTab={activeSubKey} onSelect={(subKey) => handleSelectSub('customer-order', subKey)} />
  else if (activeKey === 'production') content = <ProductionModule activeTab={activeSubKey} role={role} onSelect={(subKey) => handleSelectSub('production', subKey)} />
  else if (activeKey === 'quality') content = (
      <QualityModule
        activeTab={activeSubKey}
        activeMode={activeMode}
        role={role}
        onSelect={(subKey, mode) => handleSelectSub('quality', subKey, mode)}
      />
    )
  else if (activeKey === 'job-order') content = <JobOrderModule activeTab={activeSubKey} role={role} onSelect={(subKey) => handleSelectSub('job-order', subKey)} />
  else if (activeKey === 'maintenance') content = <MaintenanceModule activeTab={activeSubKey} role={role} onSelect={(subKey) => handleSelectSub('maintenance', subKey)} />
  else if (activeKey === 'stores') content = (
      <StoresModule
        activeTab={activeSubKey}
        activeMode={activeMode}
        role={role}
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
        <PageHeaderBandProvider breadcrumb={headerBreadcrumb(themeKey, activeSubKey)}>
          {/* Shared content column: min-w-0 lets every screen shrink to the
              space beside the sidebar (a flex item's default min-width is its
              content, which pushed wide pages past the viewport). */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <Suspense fallback={<div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading...</div>}>{content}</Suspense>
          </div>
        </PageHeaderBandProvider>
      </ModuleThemeProvider>
    </div>
  )
}

export default App
