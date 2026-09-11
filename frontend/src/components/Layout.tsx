import { useState, useEffect, useCallback } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSite } from '../context/SiteContext'
import { useServiceWorker } from '../hooks/useServiceWorker'
import api from '../services/api'
import {
  LayoutDashboard, Wrench, AlertTriangle, ClipboardList,
  Package, Search, LogOut, Users, BarChart2, RefreshCw, Factory,
  Map, BookOpen, MoreHorizontal, Menu,
  Calendar, X, Shield, Settings2, SprayCan, ChevronUp,
  WifiOff, Cloud, Bell, BellOff, RefreshCcw, Building2, QrCode
} from 'lucide-react'
import NotificationBell from './NotificationBell'
import { ThemeToggle } from './ExtraFeatures'

const navItems = [
  { section: 'Vue d\'ensemble', items: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { to: '/dashboard-superviseur', label: 'Dashboard Superviseur', icon: BarChart2 },
  ]},
  { section: 'Terrain', items: [
    { to: '/scan', label: 'Scanner QR', icon: QrCode },
    { to: '/schema', label: 'Schéma Interactif', icon: Map },
    { to: '/quick-panne', label: 'Signaler Panne', icon: AlertTriangle },
  ]},
  { section: 'Maintenance', items: [
    { to: '/pannes', label: 'Pannes', icon: AlertTriangle },
    { to: '/entretien', label: 'Entretien', icon: Settings2 },
    { to: '/nettoyage', label: 'Nettoyage', icon: SprayCan },
    { to: '/interventions', label: 'Bons de Travail', icon: ClipboardList },
    { to: '/maintenance-preventive', label: 'Prévention', icon: RefreshCw },
    { to: '/maintenance-preventive/calendar', label: 'Calendrier', icon: Calendar },
  ]},
  { section: 'Équipements', items: [
    { to: '/machines', label: 'Machines', icon: Wrench },
    { to: '/lignes', label: 'Lignes & Process', icon: Factory },
    { to: '/pieces', label: 'Pièces', icon: Package },
    { to: '/base-connaissances', label: 'Base Connaissances', icon: BookOpen },
  ]},
  { section: 'Outils', items: [
    { to: '/recherche', label: 'Recherche', icon: Search },
  ]},
]

const roleColors: Record<string, string> = {
  admin: 'text-purple-400',
  manager: 'text-blue-400',
  technicien: 'text-gray-400',
}

const roleLabels: Record<string, string> = {
  admin: 'Administrateur',
  manager: 'Manager',
  technicien: 'Technicien',
  lecteur: 'Lecteur',
  chef_equipe: "Chef d'équipe",
}

// ─── Bottom nav tabs (5 primary items) ─────────────────────────────
const bottomNavTabs = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/schema', label: 'Schéma', icon: Map },
  { to: '/scan', label: 'Scan', icon: QrCode },
  { to: '/pannes', label: 'Pannes', icon: AlertTriangle },
  { to: 'more', label: 'Plus', icon: MoreHorizontal },
]

// ─── "Plus" drawer items ──────────────────────────────────────────
const moreMenuItems = [
  { to: '/base-connaissances', label: 'Base Connaissances', icon: BookOpen },
  { to: '/lignes', label: 'Lignes & Process', icon: Factory },
  { to: '/machines', label: 'Machines', icon: Wrench },
  { to: '/entretien', label: 'Entretien', icon: Settings2 },
  { to: '/nettoyage', label: 'Nettoyage', icon: SprayCan },
  { to: '/interventions', label: 'Bons de Travail', icon: ClipboardList },
  { to: '/pieces', label: 'Pièces', icon: Package },
  { to: '/maintenance-preventive', label: 'Prévention', icon: RefreshCw },
  { to: '/maintenance-preventive/calendar', label: 'Calendrier', icon: Calendar },
  { to: '/recherche', label: 'Recherche', icon: Search },
  { to: '/dashboard-superviseur', label: 'Dashboard Superviseur', icon: LayoutDashboard },
  { to: '/quick-panne', label: 'Signaler Panne', icon: AlertTriangle },
]

const adminMenuItems = [
  { to: '/utilisateurs', label: 'Utilisateurs', icon: Users },
  { to: '/activite', label: "Journal d'activité", icon: BarChart2 },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // ─── Mobile detection ────────────────────────────────────────
  // Threshold raised to 1024px so that phones in landscape mode (typically
  // 800-915px wide) and small tablets also get the mobile layout with the
  // collapsible bottom nav.
  const MOBILE_BREAKPOINT = 1024
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT)

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    const handleResize = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT), 100)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(timeout)
    }
  }, [])

  // ─── Plus drawer state ───────────────────────────────────────
  const [plusDrawerOpen, setPlusDrawerOpen] = useState(false)

  // ─── Collapsible bottom nav (mobile) ────────────────────────
  // Persisted in localStorage so the user's preference survives reloads.
  const [navCollapsed, setNavCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('trimaint_nav_collapsed') === '1' } catch { return false }
  })
  const toggleNav = useCallback(() => {
    setNavCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('trimaint_nav_collapsed', next ? '1' : '0') } catch { /* ignore quota errors */ }
      return next
    })
  }, [])

  // ─── Collapsible desktop sidebar ─────────────────────────────
  // When collapsed, the sidebar shrinks from w-64 to w-16 (icon-only rail).
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('trimaint_sidebar_collapsed') === '1' } catch { return false }
  })
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('trimaint_sidebar_collapsed', next ? '1' : '0') } catch { /* ignore quota errors */ }
      return next
    })
  }, [])

  const openPlusDrawer = useCallback(() => setPlusDrawerOpen(true), [])
  const closePlusDrawer = useCallback(() => setPlusDrawerOpen(false), [])

  // Service Worker : offline, push, sync
  const sw = useServiceWorker()

  // Multi-sites : fetch available sites + selector
  const { selectedSite, setSelectedSite, sites, setSites } = useSite()
  useEffect(() => {
    api.get('/machines/meta/sites').then(r => setSites(r.data)).catch(() => {})
  }, [setSites])

  const handlePushToggle = useCallback(async () => {
    if (sw.pushSubscribed) {
      await sw.unsubscribePush()
    } else {
      await sw.subscribePush()
    }
  }, [sw])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // ─── Determine if a bottom tab is active ────────────────────
  const isTabActive = (tab: typeof bottomNavTabs[0]) => {
    if (tab.to === 'more') return false
    if (tab.exact) return location.pathname === tab.to
    return location.pathname.startsWith(tab.to)
  }

  // ═══════════════════════════════════════════════════════════
  //  MOBILE LAYOUT
  // ═══════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen bg-[#0f172a] text-slate-100 overflow-hidden">
        {/* ─── Top Header Bar ────────────────────────────────── */}
        <header className="fixed top-0 left-0 right-0 h-14 bg-[#1e293b] border-b border-[#334155] z-50 flex items-center justify-between px-3 shrink-0">
          {/* Left: hamburger / menu */}
          <button
            onClick={openPlusDrawer}
            className="flex items-center justify-center w-10 h-10 -ml-1 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 active:bg-gray-600 transition-colors"
            aria-label="Menu"
          >
            <Menu size={22} />
          </button>

          {/* Center: title + role badge + site selector */}
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-base">TriMaint</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
              user?.role === 'admin' ? 'bg-purple-500/20 text-purple-400' :
              user?.role === 'manager' ? 'bg-blue-500/20 text-blue-400' :
              user?.role === 'chef_equipe' ? 'bg-teal-500/20 text-teal-400' :
              'bg-gray-500/20 text-gray-400'
            }`}>
              {roleLabels[user?.role || ''] || user?.role}
            </span>
            {sites.length > 1 && (
              <select
                value={selectedSite || ''}
                onChange={e => setSelectedSite(e.target.value || null)}
                className="text-[10px] bg-gray-700 border border-gray-600 rounded-full px-2 py-0.5 text-gray-300 focus:outline-none focus:border-orange-500 max-w-[100px]"
                title="Filtrer par site"
              >
                <option value="">Tous sites</option>
                {sites.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </div>

          {/* Right: collapse toggle + offline indicator + push + notification bell */}
          <div className="flex items-center gap-1 -mr-1">
            {/* Offline indicator */}
            {!sw.isOnline && (
              <span className="flex items-center gap-1 text-[10px] bg-red-900/40 text-red-400 px-2 py-1 rounded-full">
                <WifiOff size={11} /> Hors ligne
              </span>
            )}
            {/* Sync indicator */}
            {sw.queueSize > 0 && (
              <span className="flex items-center gap-1 text-[10px] bg-amber-900/40 text-amber-400 px-2 py-1 rounded-full"
                title={`${sw.queueSize} action(s) en attente de synchronisation`}>
                <RefreshCcw size={11} className={sw.syncing ? 'animate-spin' : ''} /> {sw.queueSize}
              </span>
            )}
            {/* Push toggle */}
            {sw.pushSupported && (
              <button
                onClick={handlePushToggle}
                className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors"
                style={{ color: sw.pushSubscribed ? '#f97316' : '#9ca3af' }}
                title={sw.pushSubscribed ? 'Notifications activées — cliquer pour désactiver' : 'Activer les notifications'}
              >
                {sw.pushSubscribed ? <Bell size={16} /> : <BellOff size={16} />}
              </button>
            )}
            <button
              onClick={toggleNav}
              className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 active:bg-gray-600 transition-colors"
              aria-label={navCollapsed ? 'Afficher la navigation' : 'Réduire la navigation'}
              title={navCollapsed ? 'Afficher la barre de navigation' : 'Réduire la barre de navigation'}
            >
              <ChevronUp size={18} className={`transition-transform ${navCollapsed ? 'rotate-180' : ''}`} />
            </button>
            <div className="w-9 h-9 flex items-center justify-center">
              <NotificationBell isMobile={true} />
            </div>
          </div>
        </header>

        {/* ─── Main content area ────────────────────────────── */}
        <main className={`flex-1 overflow-auto transition-[padding] duration-300 ${navCollapsed ? 'pt-14 pb-4' : 'pt-14 pb-20'}`}>
          <Outlet />
        </main>

        {/* ─── Bottom Navigation Bar (collapsible) ──────────── */}
        <nav className={`fixed bottom-0 left-0 right-0 bg-[#1e293b] border-t border-[#334155] z-50 flex items-center justify-around px-1 transition-transform duration-300 ${
          navCollapsed ? 'h-16 translate-y-full' : 'h-16 translate-y-0'
        }`}>
          {bottomNavTabs.map(tab => {
            const Icon = tab.icon
            const active = tab.to === 'more' ? false : isTabActive(tab)

            if (tab.to === 'more') {
              return (
                <button
                  key="more"
                  onClick={openPlusDrawer}
                  className="flex flex-col items-center justify-center w-16 h-12 rounded-lg text-gray-400 hover:text-white active:bg-gray-700 transition-colors"
                >
                  <Icon size={20} strokeWidth={2} />
                  <span className="text-[10px] mt-0.5 leading-tight">Plus</span>
                </button>
              )
            }

            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.exact}
                className={`flex flex-col items-center justify-center w-16 h-12 rounded-lg transition-colors ${
                  active
                    ? 'text-indigo-400'
                    : 'text-slate-400 hover:text-white active:bg-slate-700'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                <span className={`text-[10px] mt-0.5 leading-tight ${active ? 'font-semibold' : ''}`}>
                  {tab.label}
                </span>
              </NavLink>
            )
          })}
        </nav>

        {/* ─── Floating "show nav" button when collapsed ─── */}
        {navCollapsed && (
          <button
            onClick={toggleNav}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-full shadow-2xl text-xs font-semibold transition-all active:scale-95"
            aria-label="Réafficher la navigation"
          >
            <ChevronUp size={14} />
            Menu
          </button>
        )}

        {/* ─── "Plus" Drawer (bottom sheet) ─────────────────── */}
        {plusDrawerOpen && (
          <div className="fixed inset-0 z-[60]" onClick={closePlusDrawer}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 transition-opacity" />

            {/* Bottom sheet */}
            <div
              className="absolute bottom-0 left-0 right-0 bg-gray-800 rounded-t-2xl max-h-[85vh] overflow-y-auto animate-slide-up"
              onClick={e => e.stopPropagation()}
            >
              {/* Handle bar */}
              <div className="sticky top-0 bg-gray-800 pt-3 pb-2 px-4 border-b border-gray-700 z-10">
                <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-3" />
                <div className="flex items-center justify-between">
                  <h2 className="text-white font-bold text-base">Menu</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleNav}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                        navCollapsed ? 'bg-orange-500/20 text-orange-400' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                      title="Basculer la barre de navigation"
                    >
                      <ChevronUp size={12} className={`transition-transform ${navCollapsed ? 'rotate-180' : ''}`} />
                      {navCollapsed ? 'Nav ON' : 'Nav OFF'}
                    </button>
                    <button
                      onClick={closePlusDrawer}
                      className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-3 space-y-1">
                {/* Regular menu items */}
                {moreMenuItems.map(item => {
                  const Icon = item.icon
                  const active = location.pathname === item.to || location.pathname.startsWith(item.to + '/')
                  return (
                    <button
                      key={item.to}
                      onClick={() => {
                        closePlusDrawer()
                        navigate(item.to)
                      }}
                      className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-colors min-h-[52px] ${
                        active
                          ? 'bg-orange-500/15 text-orange-400'
                          : 'text-gray-300 hover:bg-gray-700/60 active:bg-gray-700'
                      }`}
                    >
                      <Icon size={20} className="shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  )
                })}

                {/* Admin section */}
                {user?.role === 'admin' && (
                  <>
                    <div className="pt-3 mt-2 border-t border-gray-700">
                      <p className="px-4 pb-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Shield size={11} />
                        Administration
                      </p>
                    </div>
                    {adminMenuItems.map(item => {
                      const Icon = item.icon
                      const active = location.pathname === item.to || location.pathname.startsWith(item.to + '/')
                      return (
                        <button
                          key={item.to}
                          onClick={() => {
                            closePlusDrawer()
                            navigate(item.to)
                          }}
                          className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-colors min-h-[52px] ${
                            active
                              ? 'bg-orange-500/15 text-orange-400'
                              : 'text-gray-300 hover:bg-gray-700/60 active:bg-gray-700'
                          }`}
                        >
                          <Icon size={20} className="shrink-0" />
                          <span>{item.label}</span>
                        </button>
                      )
                    })}
                  </>
                )}

                {/* Logout at the bottom */}
                <div className="pt-3 mt-2 border-t border-gray-700">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 active:bg-red-500/15 transition-colors min-h-[52px]"
                  >
                    <LogOut size={20} className="shrink-0" />
                    <span>Déconnexion</span>
                  </button>
                </div>
              </div>

              {/* Bottom safe area */}
              <div className="h-6" />
            </div>
          </div>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  //  DESKTOP LAYOUT (sidebar collapsible to icon-only rail)
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="flex h-screen bg-[#0f172a] text-slate-100 overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarCollapsed ? 'w-16' : 'w-64'} bg-[#1e293b] border-r border-[#334155] flex flex-col transition-all duration-200 shrink-0`}>

        {/* Logo + collapse toggle */}
        <div className={`border-b border-[#334155] flex items-center ${sidebarCollapsed ? 'px-2 py-3 justify-center' : 'px-4 py-3.5 gap-3'}`}>
          <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/20">
            <Wrench size={18} className="text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-white tracking-tight">TriMaint</h1>
              <p className="text-[10px] text-slate-500">GMAO Triselec</p>
            </div>
          )}
          {!sidebarCollapsed && (
            <div className="flex items-center gap-0.5 shrink-0">
              {!sw.isOnline && (
                <span className="flex items-center gap-1 text-[9px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded-full border border-red-500/20" title="Hors ligne">
                  <WifiOff size={10} />
                </span>
              )}
              {sw.queueSize > 0 && (
                <span className="flex items-center gap-1 text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/20"
                  title={`${sw.queueSize} action(s) en attente`}>
                  <RefreshCcw size={10} className={sw.syncing ? 'animate-spin' : ''} />{sw.queueSize}
                </span>
              )}
              {sw.pushSupported && (
                <button
                  onClick={handlePushToggle}
                  className="p-1 rounded-md hover:bg-slate-700 transition-colors"
                  style={{ color: sw.pushSubscribed ? '#818cf8' : '#64748b' }}
                  title={sw.pushSubscribed ? 'Notifications ON' : 'Notifications OFF'}
                >
                  {sw.pushSubscribed ? <Bell size={14} /> : <BellOff size={14} />}
                </button>
              )}
              <NotificationBell />
              <ThemeToggle />
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className={`p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors shrink-0 ${sidebarCollapsed ? 'mt-2' : ''}`}
            aria-label={sidebarCollapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'}
            title={sidebarCollapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'}
          >
            <ChevronUp size={16} className={`transition-transform ${sidebarCollapsed ? 'rotate-90' : '-rotate-90'}`} />
          </button>
        </div>

        {/* Navigation principale — sections groupées */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto overflow-x-hidden">
          {navItems.map((group, gi) => (
            <div key={gi} className="mb-4">
              {!sidebarCollapsed && (
                <p className="px-3 pb-1.5 text-[10px] font-semibold text-slate-600 uppercase tracking-wider">{group.section}</p>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ to, label, icon: Icon, exact }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={exact}
                    title={sidebarCollapsed ? label : undefined}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150 ${
                        sidebarCollapsed ? 'px-0 py-2 justify-center' : 'px-3 py-2'
                      } ${
                        isActive
                          ? 'bg-indigo-500/10 text-indigo-400 border-l-2 border-indigo-500'
                          : 'text-slate-400 hover:text-white hover:bg-slate-700/50 border-l-2 border-transparent'
                      }`
                    }
                  >
                    <Icon size={17} className="shrink-0" />
                    {!sidebarCollapsed && <span className="truncate">{label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}

          {/* Section admin */}
          {(user?.role === 'admin' || user?.role === 'chef_equipe') && (
            <div className="mb-4">
              {!sidebarCollapsed && (
                <p className="px-3 pb-1.5 text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Administration</p>
              )}
              <div className="space-y-0.5">
                <NavLink
                  to="/utilisateurs"
                  title={sidebarCollapsed ? 'Utilisateurs' : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150 ${
                      sidebarCollapsed ? 'px-0 py-2 justify-center' : 'px-3 py-2'
                    } ${
                      isActive
                        ? 'bg-indigo-500/10 text-indigo-400 border-l-2 border-indigo-500'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50 border-l-2 border-transparent'
                    }`
                  }
                >
                  <Users size={17} className="shrink-0" />
                  {!sidebarCollapsed && <span>Utilisateurs</span>}
                </NavLink>
                <NavLink
                  to="/activite"
                  title={sidebarCollapsed ? 'Journal d&apos;activité' : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150 ${
                      sidebarCollapsed ? 'px-0 py-2 justify-center' : 'px-3 py-2'
                    } ${
                      isActive
                        ? 'bg-indigo-500/10 text-indigo-400 border-l-2 border-indigo-500'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50 border-l-2 border-transparent'
                    }`
                  }
                >
                  <BarChart2 size={17} className="shrink-0" />
                  {!sidebarCollapsed && <span>Journal d&apos;activité</span>}
                </NavLink>
              </div>
            </div>
          )}
        </nav>

        {/* Pied de sidebar */}
        <div className={`border-t border-[#334155] ${sidebarCollapsed ? 'px-2 py-3' : 'px-3 py-3'}`}>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-3 px-2 py-2 mb-1 bg-slate-700/30 rounded-lg">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-full flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-white">{user?.username?.[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.username}</p>
                <p className={`text-[10px] capitalize font-medium ${roleColors[user?.role || ''] || 'text-slate-400'}`}>
                  {roleLabels[user?.role || ''] || user?.role}
                </p>
              </div>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="flex justify-center mb-1">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-full flex items-center justify-center" title={user?.username || ''}>
                <span className="text-sm font-bold text-white">{user?.username?.[0]?.toUpperCase()}</span>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            title={sidebarCollapsed ? 'Déconnexion' : undefined}
            className={`flex items-center gap-3 text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/5 rounded-lg transition-colors ${sidebarCollapsed ? 'w-full px-0 py-2 justify-center' : 'w-full px-3 py-2'}`}
          >
            <LogOut size={16} className="shrink-0" />
            {!sidebarCollapsed && <span>Déconnexion</span>}
          </button>
        </div>
      </aside>

      {/* Contenu principal */}
      <main className="flex-1 overflow-auto bg-[#0f172a]">
        <Outlet />
      </main>
    </div>
  )
}