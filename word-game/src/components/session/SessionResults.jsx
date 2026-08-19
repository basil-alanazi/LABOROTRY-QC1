import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import Card from '../ui/Card'
import { createSession } from '../../lib/createSession'

const MEDALS = ['🥇', '🥈', '🥉']

export default function SessionResults({ gameId, results, myId, hostId, currentUserId }) {
  const navigate = useNavigate()
  const mine = results.find((p) => p.id === myId)

  async function playAgain() {
    const session = await createSession(gameId, currentUserId)
    navigate(`/session/${session.code}`)
  }

  return (
    <div className="flex flex-col items-center gap-6 pt-6 pb-6">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        className="text-center"
      >
        <div className="text-6xl mb-2">🎉</div>
        <h1 className="font-display font-bold text-2xl">انتهت اللعبة</h1>
        <p className="text-primary font-black text-3xl mt-1">{(mine?.score || 0).toLocaleString('en-US')} نقطة</p>
      </motion.div>

      <Card className="w-full p-5 flex flex-col gap-4">
        {results.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className={`flex items-center gap-3 rounded-btn px-3 py-2.5 ${
              p.id === myId ? 'bg-primary-soft' : ''
            }`}
          >
            <span className="w-7 text-center font-black">{MEDALS[i] || i + 1}</span>
            <Avatar name={p.name} src={p.avatarUrl} size="sm" />
            <span className="font-bold flex-1">{p.name}</span>
            <span className="font-black text-primary">{p.score.toLocaleString('en-US')}</span>
          </motion.div>
        ))}
      </Card>

      <div className="w-full flex flex-col gap-3">
        <Button variant="primary" size="lg" full onClick={playAgain}>
          العب مرة ثانية
        </Button>
        <Button variant="ghost" size="lg" full onClick={() => navigate('/games')}>
          لعبة ثانية
        </Button>
        <Button variant="outline" size="lg" full onClick={() => navigate('/')}>
          العودة للرئيسية
        </Button>
      </div>
    </div>
  )
}
