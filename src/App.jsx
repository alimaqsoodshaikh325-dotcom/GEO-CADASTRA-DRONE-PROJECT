import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import Dashboard from './pages/Dashboard'
import AnalysisPage from './pages/AnalysisPage'
import ModelsPage from './pages/ModelsPage'
import MapPage from './pages/MapPage'
import PlatformPage from './pages/PlatformPage'
import AboutPage from './pages/AboutPage'
import NotFoundPage from './pages/NotFoundPage'
import ParcelsPage from './pages/ParcelsPage'
import ReportsPage from './pages/ReportsPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'
import ProcessingPage from './pages/ProcessingPage'
import ResultsPage from './pages/ResultsPage'
import ReviewPage from './pages/ReviewPage'
import DatasetsPage from './pages/DatasetsPage'
import AssistantPage from './pages/AssistantPage'
import ProfilePage from './pages/ProfilePage'
import { JobProvider } from './hooks/useJob'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { DemoProvider } from './hooks/useDemo'
import AppShell from './layouts/AppShell'

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  }

  return <AppShell>{children}</AppShell>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/platform" element={<PlatformPage />} />
      <Route path="/analysis" element={<ProtectedRoute><AnalysisPage /></ProtectedRoute>} />
      <Route path="/map" element={<ProtectedRoute><MapPage /></ProtectedRoute>} />
      <Route path="/assistant" element={<ProtectedRoute><AssistantPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/models" element={<ProtectedRoute><ModelsPage /></ProtectedRoute>} />
      <Route path="/datasets" element={<ProtectedRoute><DatasetsPage /></ProtectedRoute>} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/processing" element={<ProtectedRoute><ProcessingPage /></ProtectedRoute>} />
      <Route path="/processing/:jobId" element={<ProtectedRoute><ProcessingPage /></ProtectedRoute>} />
      <Route path="/results" element={<ProtectedRoute><ResultsPage /></ProtectedRoute>} />
      <Route path="/results/:jobId" element={<ProtectedRoute><ResultsPage /></ProtectedRoute>} />
      <Route path="/buildings" element={<ProtectedRoute><ResultsPage /></ProtectedRoute>} />
      <Route path="/parcels" element={<ProtectedRoute><ParcelsPage /></ProtectedRoute>} />
      <Route path="/review" element={<ProtectedRoute><ReviewPage /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <DemoProvider>
        <JobProvider>
          <AppRoutes />
        </JobProvider>
      </DemoProvider>
    </AuthProvider>
  )
}
