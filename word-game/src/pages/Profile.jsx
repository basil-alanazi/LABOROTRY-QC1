import { useProfile } from '../lib/profile'
import Avatar from '../components/ui/Avatar'
import Card from '../components/ui/Card'

const ACHIEVEMENTS = [
  { key: 'first_game', label: 'أول لعبة', icon: '🎮', test: (p) => p.games_played >= 1 },
  { key: 'first_win', label: 'أول فوز', icon: '🏆', test: (p) => p.wins >= 1 },
  { key: 'ten_games', label: '10 ألعاب', icon: '🔥', test: (p) => p.games_played >= 10 },
  { key: 'five_wins', label: '5 انتصارات', icon: '⭐', test: (p) => p.wins >= 5 },
  { key: 'sharp_shooter', label: 'نتيجة 500+', icon: '🎯', test: (p) => p.best_score >= 500 },
  { key: 'legend', label: 'مستوى 10', icon: '👑', test: (p) => p.level >= 10 },
]

export default function Profile() {
  const { profile } = useProfile()
  if (!profile) return null

  const unlocked = ACHIEVEMENTS.filter((a) => a.test(profile))

  const stats = [
    { label: 'فوز', value: profile.wins, icon: '🏆' },
    { label: 'لعبة', value: profile.games_played, icon: '🎮' },
    { label: 'نقطة', value: profile.total_points.toLocaleString('en-US'), icon: '⭐' },
  ]

  return (
    <div className="flex flex-col gap-6 pb-6">
      <Card className="p-6 flex flex-col items-center text-center gap-3">
        <Avatar name={profile.display_name} src={profile.avatar_url} size="xl" />
        <div>
          <h1 className="text-xl font-black">{profile.display_name}</h1>
        </div>
        <span className="bg-primary-soft text-primary font-black text-sm rounded-pill px-4 py-1.5">
          Level {profile.level}
        </span>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-4 text-center flex flex-col items-center gap-1">
            <span className="text-xl">{s.icon}</span>
            <span className="font-black text-lg">{s.value}</span>
            <span className="text-xs text-ink-muted font-bold">{s.label}</span>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="font-bold text-sm text-ink-muted mb-3">أفضل نتيجة</h2>
        <p className="text-3xl font-black text-primary">{profile.best_score.toLocaleString('en-US')}</p>
      </Card>

      <div>
        <h2 className="font-black text-lg mb-3">🏅 الإنجازات</h2>
        <div className="grid grid-cols-3 gap-3">
          {ACHIEVEMENTS.map((a) => {
            const isUnlocked = unlocked.includes(a)
            return (
              <Card
                key={a.key}
                className={`p-4 text-center flex flex-col items-center gap-1 ${
                  isUnlocked ? '' : 'opacity-35 grayscale'
                }`}
              >
                <span className="text-2xl">{a.icon}</span>
                <span className="text-xs font-bold">{a.label}</span>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
