import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function GameScreen({
  roundIndex,
  totalRounds,
  timeLeft,
  totalTime,
  roundData,
  phase,
  resultInfo,
  onSubmitGuess,
  onExit,
  players = {},
  myId,
}) {
  const [wrongId, setWrongId] = useState(null)
  const urgent = timeLeft <= 5
  const isImpostor = roundData && myId === roundData.impostorId

  const others = Object.entries(players).filter(([id]) => id !== myId)

  function accuse(playerId) {
    if (phase !== 'playing') return
    const ok = onSubmitGuess(playerId)
    if (!ok) {
      setWrongId(playerId)
      setTimeout(() => setWrongId(null), 350)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-canvas flex flex-col">
      <div className="flex items-center justify-between px-5 pt-5">
        <button
          type="button"
          aria-label="خروج"
          onClick={onExit}
          className="relative z-10 w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center text-ink-muted"
        >
          <X size={18} />
        </button>
        <div className="text-center">
          <p className="text-xs text-ink-muted font-bold">من الإمبوستر؟</p>
          <p className="text-sm font-black">
            الجولة <span className="text-primary">{roundIndex}</span> / {totalRounds}
          </p>
        </div>
        <div className="w-9" />
      </div>

      <div className="flex-1 flex flex-col items-center px-6 gap-5 overflow-y-auto py-6">
        <AnimatePresence mode="wait">
          {phase === 'playing' && (
            <motion.div
              key="playing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-5 w-full max-w-sm"
            >
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`text-3xl font-black tabular-nums transition-colors ${
                    urgent ? 'text-danger' : 'text-ink'
                  }`}
                >
                  {formatTime(timeLeft)}
                </div>
                <div className="w-40 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${urgent ? 'bg-danger' : 'bg-primary'}`}
                    animate={{ width: `${(timeLeft / totalTime) * 100}%` }}
                    transition={{ ease: 'linear', duration: 0.9 }}
                  />
                </div>
              </div>

              {isImpostor ? (
                <div className="w-full rounded-card shadow-pop p-6 flex flex-col items-center gap-2 text-center bg-danger-soft">
                  <span className="text-5xl">🕵️</span>
                  <p className="font-black text-lg text-danger">إنت الإمبوستر!</p>
                  <p className="text-sm text-ink-muted">
                    ما تعرف الكلمة. تصرف طبيعي وحاول تخمنها من كلام الباقين قبل ما ينكشفون عليك.
                  </p>
                </div>
              ) : (
                <div className="w-full rounded-card shadow-pop p-6 flex flex-col items-center gap-2 text-center bg-primary-soft">
                  <span className="text-5xl">🗝️</span>
                  <p className="text-sm text-ink-muted font-bold">الكلمة السرية</p>
                  <p className="text-3xl font-black text-primary">{roundData?.word}</p>
                  <p className="text-xs text-ink-muted mt-1">
                    ناقشوا الكلمة بدون ما تقولونها صراحة، ودوروا مين ما يعرفها (الإمبوستر).
                  </p>
                </div>
              )}

              <div className="w-full flex flex-col gap-2">
                <p className="font-bold text-sm text-ink-muted text-center">اتهم الإمبوستر</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {others.map(([id, p]) => (
                    <motion.button
                      key={id}
                      animate={wrongId === id ? { x: [0, -8, 8, -8, 8, 0] } : {}}
                      transition={{ duration: 0.35 }}
                      onClick={() => accuse(id)}
                      className="flex flex-col items-center gap-1.5 bg-surface border border-line rounded-card p-3"
                    >
                      <Avatar name={p.name} src={p.avatarUrl} size="md" />
                      <span className="text-xs font-bold truncate w-full text-center">{p.name}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {phase === 'result' && resultInfo && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="flex flex-col items-center gap-3 text-center flex-1 justify-center"
            >
              {resultInfo.winnerId ? (
                <>
                  <div className="text-6xl">{resultInfo.isMe ? '🎉' : '👏'}</div>
                  <p className="text-2xl font-black text-success">
                    {resultInfo.isMe ? 'مسكته!' : `${resultInfo.winnerName} مسك الإمبوستر`}
                  </p>
                  {resultInfo.isMe && <p className="text-primary font-bold text-lg">+100 نقطة</p>}
                </>
              ) : (
                <>
                  <div className="text-6xl">🕵️</div>
                  <p className="text-2xl font-black text-danger">الإمبوستر نجا!</p>
                </>
              )}
              <p className="text-ink-muted">
                الإمبوستر كان: <b className="text-ink">{players[resultInfo.word?.impostorId]?.name || '؟'}</b>
              </p>
              <p className="text-ink-muted">
                الكلمة كانت: <b className="text-ink">{resultInfo.word?.word}</b>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
