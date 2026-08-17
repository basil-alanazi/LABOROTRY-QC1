import { useAuth } from '../lib/auth'
import GamesGrid from '../components/GamesGrid'

export default function Dashboard() {
  const { profile } = useAuth()

  return (
    <div className="flex flex-col gap-8 pb-6">
      <div className="flex flex-col md:flex-row items-center gap-6">
        <div className="flex flex-col gap-2 text-center md:text-start">
          <h1 className="font-display font-bold text-2xl md:text-3xl">
            هلا، {profile.display_name} 👋
          </h1>
          <p className="font-display text-ink-muted text-lg">وش نلعب اليوم؟</p>
        </div>
        <img
          src="/brand/hero-table.jpg"
          alt="جمعتنا"
          className="w-full md:w-80 rounded-card shadow-card object-cover"
        />
      </div>

      <GamesGrid />
    </div>
  )
}
