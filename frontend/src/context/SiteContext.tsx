/**
 * SiteContext — gère le site sélectionné globalement (multi-sites).
 * Stocké dans localStorage. L'intercepteur axios ajoute ?site=xxx automatiquement.
 */
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'

interface SiteContextType {
  selectedSite: string | null
  setSelectedSite: (site: string | null) => void
  sites: string[]
  setSites: (sites: string[]) => void
}

const SiteContext = createContext<SiteContextType | null>(null)

export function SiteProvider({ children }: { children: ReactNode }) {
  const [selectedSite, setSelectedSiteState] = useState<string | null>(() => {
    try { return localStorage.getItem('trimaint_selected_site') || null } catch { return null }
  })
  const [sites, setSites] = useState<string[]>([])

  const setSelectedSite = useCallback((site: string | null) => {
    setSelectedSiteState(site)
    try {
      if (site) localStorage.setItem('trimaint_selected_site', site)
      else localStorage.removeItem('trimaint_selected_site')
    } catch { /* ignore */ }
  }, [])

  // Expose globally for axios interceptor
  useEffect(() => {
    (window as unknown as { __trimaintSite?: string | null }).__trimaintSite = selectedSite
  }, [selectedSite])

  return (
    <SiteContext.Provider value={{ selectedSite, setSelectedSite, sites, setSites }}>
      {children}
    </SiteContext.Provider>
  )
}

export function useSite() {
  const ctx = useContext(SiteContext)
  if (!ctx) throw new Error('useSite must be used within SiteProvider')
  return ctx
}
