import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { getGame } from '../games/registry'
import { createSession } from '../lib/createSession'
import { useAuth } from '../lib/auth'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

export default function GameDetails() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const game = getGame(gameId)
  const [starting, setStarting] = useState(false)
  const [joinCode, setJoinCode] = useState('')

  if (!game) {
    return (
      <div className="text-center py-20">
        <p className="font-bold mb-3">هذي اللعبة غير متوفرة بعد 👀</p>
        <Link to="/games" className="text-primary font-bold">
          رجوع للألعاب
        </Link>
      </div>
    )
  }

  async function handleStart() {
    setStarting(true)
    try {
      const session = await createSession(game.id, profile.id)
      navigate(`/session/${session.code}`)
    } finally {
      setStarting(false)
    }
  }

  function handleJoin(e) {
    e.preventDefault()
    if (!joinCode.trim()) return
    navigate(`/session/${joinCode.trim().toUpperCase()}`)
  }

  return (
    <div className="flex flex-col gap-6 pb-6">
      <Card className="p-6 text-center flex flex-col items-center gap-3">
        <span className="text-5xl">{game.icon}</span>
        <h1 className="text-xl font-black">{game.name}</h1>
        <p className="text-ink-muted">{game.longDescription || game.description}</p>
        <div className="flex gap-2 text-xs font-bold text-ink-muted">
          <span className="bg-surface-2 rounded-pill px-3 py-1">{game.defaultRounds} جولات</span>
          <span className="bg-surface-2 rounded-pill px-3 py-1">{game.defaultSeconds} ثانية/جولة</span>
        </div>
        <Button size="lg" full onClick={handleStart} disabled={starting} className="mt-2">
          {starting ? 'جارٍ التجهيز...' : '+ ابدأ جلسة'}
        </Button>
      </Card>

      <Card className="p-5">
        <h2 className="font-bold text-sm text-ink-muted mb-3">عندك رمز جلسة؟</h2>
        <form onSubmit={handleJoin} className="flex gap-2">
          <Input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="مثال: 7K92"
            dir="ltr"
            className="text-center tracking-[0.3em] font-black"
            maxLength={4}
          />
          <Button type="submit" variant="soft">
            انضمام
          </Button>
        </form>
      </Card>
    </div>
  )
}
