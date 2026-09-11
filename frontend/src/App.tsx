import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SiteProvider } from './context/SiteContext'
import Layout from './components/Layout'
import Login from './pages/Login'

// Code splitting : les pages ne sont chargées qu'à la demande
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Machines = lazy(() => import('./pages/Machines'))
const MachineDetail = lazy(() => import('./pages/MachineDetail'))
const Lignes = lazy(() => import('./pages/Lignes'))
const LigneDetail = lazy(() => import('./pages/LigneDetail'))
const Pannes = lazy(() => import('./pages/Pannes'))
const PanneDetail = lazy(() => import('./pages/PanneDetail'))
const RapportPanne = lazy(() => import('./pages/RapportPanne'))
const Interventions = lazy(() => import('./pages/Interventions'))
const Pieces = lazy(() => import('./pages/Pieces'))
const Recherche = lazy(() => import('./pages/Recherche'))
const Utilisateurs = lazy(() => import('./pages/Utilisateurs'))
const Activite = lazy(() => import('./pages/Activite'))
const MaintenancePreventive = lazy(() => import('./pages/MaintenancePreventive'))
const CalendarMaintenance = lazy(() => import('./pages/CalendarMaintenance'))
const DashboardSuperviseur = lazy(() => import('./pages/DashboardSuperviseur'))
const SchemaInteractif = lazy(() => import('./pages/SchemaInteractif'))
const BaseConnaissances = lazy(() => import('./pages/BaseConnaissances'))
const QuickPanne = lazy(() => import('./pages/QuickPanne'))
const Entretien = lazy(() => import('./pages/Entretien'))
const Nettoyage = lazy(() => import('./pages/Nettoyage'))
const BonTravailDetail = lazy(() => import('./pages/BonTravailDetail'))
const BonTravailForm = lazy(() => import('./pages/BonTravailForm'))
const Scanner = lazy(() => import('./pages/Scanner'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin' && user.role !== 'chef_equipe') return <Navigate to="/" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
        <Route path="schema" element={<Suspense fallback={<PageLoader />}><SchemaInteractif /></Suspense>} />
        <Route path="base-connaissances" element={<Suspense fallback={<PageLoader />}><BaseConnaissances /></Suspense>} />
        <Route path="machines" element={<Suspense fallback={<PageLoader />}><Machines /></Suspense>} />
        <Route path="machines/:id" element={<Suspense fallback={<PageLoader />}><MachineDetail /></Suspense>} />

        <Route path="lignes" element={<Suspense fallback={<PageLoader />}><Lignes /></Suspense>} />
        <Route path="lignes/:ligne" element={<Suspense fallback={<PageLoader />}><LigneDetail /></Suspense>} />
        <Route path="pannes" element={<Suspense fallback={<PageLoader />}><Pannes /></Suspense>} />
        <Route path="pannes/:id" element={<Suspense fallback={<PageLoader />}><PanneDetail /></Suspense>} />
        <Route path="pannes/:id/rapport" element={<Suspense fallback={<PageLoader />}><RapportPanne /></Suspense>} />
        <Route path="maintenance-preventive" element={<Suspense fallback={<PageLoader />}><MaintenancePreventive /></Suspense>} />
        <Route path="maintenance-preventive/calendar" element={<Suspense fallback={<PageLoader />}><CalendarMaintenance /></Suspense>} />
        <Route path="dashboard-superviseur" element={<Suspense fallback={<PageLoader />}><DashboardSuperviseur /></Suspense>} />
        <Route path="interventions" element={<Suspense fallback={<PageLoader />}><Interventions /></Suspense>} />
        <Route path="pieces" element={<Suspense fallback={<PageLoader />}><Pieces /></Suspense>} />
        <Route path="recherche" element={<Suspense fallback={<PageLoader />}><Recherche /></Suspense>} />
        <Route path="quick-panne" element={<Suspense fallback={<PageLoader />}><QuickPanne /></Suspense>} />
        <Route path="scan" element={<Suspense fallback={<PageLoader />}><Scanner /></Suspense>} />
        <Route path="entretien" element={<Suspense fallback={<PageLoader />}><Entretien /></Suspense>} />
        <Route path="nettoyage" element={<Suspense fallback={<PageLoader />}><Nettoyage /></Suspense>} />
        <Route path="bons-travail/new" element={<Suspense fallback={<PageLoader />}><BonTravailForm /></Suspense>} />
        <Route path="bons-travail/:id" element={<Suspense fallback={<PageLoader />}><BonTravailDetail /></Suspense>} />
        <Route path="utilisateurs" element={<AdminRoute><Suspense fallback={<PageLoader />}><Utilisateurs /></Suspense></AdminRoute>} />
        <Route path="activite" element={<AdminRoute><Suspense fallback={<PageLoader />}><Activite /></Suspense></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <SiteProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster
            position="top-right"
            toastOptions={{
              style: { background: '#1f2937', color: '#f9fafb', border: '1px solid #374151' },
              success: { iconTheme: { primary: '#f97316', secondary: '#fff' } },
            }}
          />
        </BrowserRouter>
      </SiteProvider>
    </AuthProvider>
  )
}