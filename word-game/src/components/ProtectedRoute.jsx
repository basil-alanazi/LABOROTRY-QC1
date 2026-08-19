import { useProfile } from '../lib/profile'
import Onboarding from '../pages/Onboarding'
import AppShell from './layout/AppShell'

export default function ProtectedRoute({ children }) {
  const { profile, loading } = useProfile()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="w-10 h-10 rounded-full border-4 border-primary-soft border-t-primary animate-spin" />
      </div>
    )
  }

  if (!profile) return <Onboarding />

  return <AppShell>{children}</AppShell>
}
