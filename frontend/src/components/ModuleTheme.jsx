import { createContext, useContext } from 'react'

// Each module's own PageHeader gradient -- a shade of blue distinct enough
// to tell modules apart at a glance. The outermost accent bar (PageHeader's
// skewed corner strip) and the footer bar are NOT part of this -- those stay
// one consistent color across the whole app regardless of module.
export const MODULE_COLORS = {
  dashboard: { from: '#1E4C8A', to: '#0F2A52' },
  masters: { from: '#2E5C9A', to: '#15305C' },
  production: { from: '#1B5E8C', to: '#0D3550' },
  quality: { from: '#3A5FA0', to: '#1C2F5C' },
  'customer-order': { from: '#2563A8', to: '#123561' },
  'job-order': { from: '#1E6E8C', to: '#0E3A4A' },
  maintenance: { from: '#46618F', to: '#243654' },
  stores: { from: '#1E4C8A', to: '#132F52' },
}

const ModuleThemeContext = createContext(null)

export function ModuleThemeProvider({ module, children }) {
  return (
    <ModuleThemeContext.Provider value={MODULE_COLORS[module] ?? MODULE_COLORS.dashboard}>
      {children}
    </ModuleThemeContext.Provider>
  )
}

export function useModuleTheme() {
  return useContext(ModuleThemeContext) ?? MODULE_COLORS.dashboard
}
