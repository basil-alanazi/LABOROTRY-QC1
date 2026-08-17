import { useNavigate } from 'react-router-dom'
import { listGames } from '../games/registry'
import Card from '../components/ui/Card'

export default function Games() {
  const navigate = useNavigate()
  const games = listGames()

  const placeholders = [
    { id: 'arrange-letters', name: 'رتّبها', description: 'رتب الحروف لتكوين الكلمة.', icon: '🧩' },
    { id: 'fastest-word', name: 'أسرع كلمة', description: 'اكتب الكلمة الصحيحة قبل انتهاء الوقت.', icon: '⚡' },
    { id: 'guess-it', name: 'خمنها', description: 'خمن الكلمة من التلميحات.', icon: '🧠' },
    { id: 'friend-challenge', name: 'تحدي الأصدقاء', description: 'تحدى شخصًا من جماعتك.', icon: '👥' },
  ]

  return (
    <div className="flex flex-col gap-6 pb-6">
      <h1 className="text-2xl font-black">🎮 الألعاب</h1>

      <div className="grid grid-cols-2 gap-3">
        {games.map((g) => (
          <Card
            key={g.id}
            hover
            onClick={() => navigate(`/games/${g.id}`)}
            className="p-5 cursor-pointer flex flex-col gap-2"
          >
            <span className="text-3xl">{g.icon}</span>
            <h3 className="font-black">{g.name}</h3>
            <p className="text-xs text-ink-muted leading-relaxed">{g.description}</p>
          </Card>
        ))}

        {placeholders.map((g) => (
          <Card key={g.id} className="p-5 flex flex-col gap-2 opacity-60 relative">
            <span className="absolute top-3 left-3 text-[0.65rem] font-black bg-surface-2 text-ink-muted rounded-pill px-2 py-1">
              قريبًا
            </span>
            <span className="text-3xl">{g.icon}</span>
            <h3 className="font-black">{g.name}</h3>
            <p className="text-xs text-ink-muted leading-relaxed">{g.description}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}
