import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import AppShell from './layout/AppShell'

export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="w-10 h-10 rounded-full border-4 border-primary-soft border-t-primary animate-spin" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  return <AppShell>{children}</AppShell>
}
