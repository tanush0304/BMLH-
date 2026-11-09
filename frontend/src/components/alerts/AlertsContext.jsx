import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { ALERT_SOURCES } from './alertSources'
import { alertCount, canSeeAlerts, hasDismissedAlerts, loadAlertGroups, rememberDismissedAlerts } from '../../utils/alerts'

const AlertsContext = createContext(null)

/**
 * Supervisor/admin reminders. Reloads each time the Main Menu shows (login
 * lands there too) and pops the "Needs attention" dialog unless "Got it" was
 * pressed this session. Operators: nothing loaded, no bell, no pop-up.
 */
export function useAlertsState({ role, userId, onMainMenu, sources = ALERT_SOURCES }) {
  const allowed = canSeeAlerts(role)
  const [groups, setGroups] = useState([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!allowed) {
      setGroups([])
      setOpen(false)
      return
    }
    if (!onMainMenu) return
    let active = true
    loadAlertGroups(role, sources).then((g) => {
      if (!active) return
      setGroups(g)
      if (alertCount(g) > 0 && !hasDismissedAlerts(userId)) setOpen(true)
    })
    return () => {
      active = false
    }
  }, [allowed, role, userId, onMainMenu, sources])

  const openList = useCallback(() => setOpen(true), [])
  const later = useCallback(() => setOpen(false), [])
  const gotIt = useCallback(() => {
    rememberDismissedAlerts(userId)
    setOpen(false)
  }, [userId])

  return { allowed, groups, count: alertCount(groups), open, openList, later, gotIt }
}

export function AlertsProvider({ value, children }) {
  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>
}

export function useAlerts() {
  return useContext(AlertsContext)
}
