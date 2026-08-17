import { useNavigate } from 'react-router-dom'
import Card from './ui/Card'
import Button from './ui/Button'
import { listGames } from '../games/registry'
import { COMING_SOON_GAMES } from '../games/comingSoon'

export default function GamesGrid({ title = 'اختر لعبتك' }) {
  const navigate = useNavigate()
  const games = listGames()

  return (
    <div>
      {title && <h2 className="font-display font-bold text-xl mb-4">{title}</h2>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {games.map((g) => (
          <Card key={g.id} hover className="p-4 flex flex-col items-center text-center gap-2">
            <span className="text-4xl">{g.icon}</span>
            <h3 className="font-display font-bold">{g.name}</h3>
            <p className="text-xs text-ink-muted leading-relaxed hidden sm:block">{g.description}</p>
            <Button size="sm" full onClick={() => navigate(`/games/${g.id}`)} className="mt-1">
              العب الآن
            </Button>
          </Card>
        ))}

        {COMING_SOON_GAMES.map((g) => (
          <Card key={g.id} className="p-4 flex flex-col items-center text-center gap-2 relative opacity-70">
            <span className="absolute top-2.5 left-2.5 text-[0.6rem] font-bold bg-surface-2 text-ink-muted rounded-pill px-2 py-0.5">
              قريبًا
            </span>
            <span className="text-4xl">{g.icon}</span>
            <h3 className="font-display font-bold">{g.name}</h3>
            <p className="text-xs text-ink-muted leading-relaxed hidden sm:block">{g.description}</p>
            <Button size="sm" full disabled className="mt-1">
              العب الآن
            </Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
