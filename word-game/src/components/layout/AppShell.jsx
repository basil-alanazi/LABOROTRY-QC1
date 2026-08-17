import Sidebar from './Sidebar'
import BottomNav from './BottomNav'

export default function AppShell({ children }) {
  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 min-w-0 pb-24 md:pb-8">
        <div className="max-w-3xl mx-auto px-4 pt-6 md:pt-8">{children}</div>
      </main>
      <BottomNav />
    </div>
  )
}
