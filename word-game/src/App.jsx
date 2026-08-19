import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProfileProvider } from './lib/profile'
import { ThemeProvider } from './lib/theme'
import ProtectedRoute from './components/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import Games from './pages/Games'
import GameDetails from './pages/GameDetails'
import SessionRoom from './pages/SessionRoom'
import Profile from './pages/Profile'
import Leaderboard from './pages/Leaderboard'
import Settings from './pages/Settings'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/games" element={<ProtectedRoute><Games /></ProtectedRoute>} />
      <Route path="/games/:gameId" element={<ProtectedRoute><GameDetails /></ProtectedRoute>} />
      <Route path="/session/:code" element={<ProtectedRoute><SessionRoom /></ProtectedRoute>} />
      <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ProfileProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ProfileProvider>
    </ThemeProvider>
  )
}
