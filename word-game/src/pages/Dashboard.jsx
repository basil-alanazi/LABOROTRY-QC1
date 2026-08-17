import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { getGame } from '../games/registry'
import { createSession } from '../lib/createSession'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'

export default function Dashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [starting, setStarting] = useState(false)
  const todayGame = getGame('reversed-words')

  async function startToday() {
    setStarting(true)
    try {
      const session = await createSession(todayGame.id, profile.id)
      navigate(`/session/${session.code}`)
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="flex flex-col gap-8 pb-6">
      <div>
        <h1 className="text-2xl font-black">هلا، {profile.display_name} 👋</h1>
        <p className="text-ink-muted font-bold">وش نلعب اليوم؟</p>
      </div>

      <div>
        <h2 className="font-black text-lg mb-3 flex items-center gap-2">🔥 تحدي اليوم</h2>
        <Card hover className="p-6 bg-gradient-to-bl from-primary to-[#5641c9] text-primary-ink border-none overflow-hidden relative">
          <div className="absolute -left-6 -top-6 text-9xl opacity-15 select-none">{todayGame.icon}</div>
          <div className="relative flex flex-col gap-3">
            <span className="text-4xl">{todayGame.icon}</span>
            <h3 className="text-xl font-black">{todayGame.name}</h3>
            <p className="text-primary-ink/80 font-medium">فك الكلمة قبل انتهاء الوقت!</p>
            <Button
              variant="accent"
              size="lg"
              className="mt-2 w-fit"
              onClick={startToday}
              disabled={starting}
            >
              {starting ? 'جارٍ التجهيز...' : 'ابدأ اللعب'}
            </Button>
          </div>
        </Card>
      </div>

      <div>
        <h2 className="font-black text-lg mb-3 flex items-center gap-2">🎮 اختصارات</h2>
        <div className="grid grid-cols-2 gap-3">
          <Card
            hover
            onClick={() => navigate('/games')}
            className="p-5 cursor-pointer flex flex-col items-center text-center gap-1"
          >
            <span className="text-2xl">🎮</span>
            <span className="font-bold text-sm">كل الألعاب</span>
          </Card>
          <Card
            hover
            onClick={() => navigate('/friends')}
            className="p-5 cursor-pointer flex flex-col items-center text-center gap-1"
          >
            <span className="text-2xl">👥</span>
            <span className="font-bold text-sm">جماعتنا</span>
          </Card>
        </div>
      </div>
    </div>
  )
}
