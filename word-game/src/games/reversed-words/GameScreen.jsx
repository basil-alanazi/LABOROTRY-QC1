import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { isArabic } from './logic'

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
  myLastWasCorrect,
  onSubmitGuess,
  onExit,
}) {
  const [guess, setGuess] = useState('')
  const [shake, setShake] = useState(false)

  const scrambled = roundData?.scrambled || ''
  const rtl = isArabic(scrambled)
  const urgent = timeLeft <= 5

  function handleSubmit(e) {
    e.preventDefault()
    if (phase !== 'playing' || !guess.trim()) return
    const ok = onSubmitGuess(guess)
    if (ok) {
      setGuess('')
    } else {
      setShake(true)
      setTimeout(() => setShake(false), 350)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-canvas flex flex-col">
      <div className="flex items-center justify-between px-5 pt-5">
        <button onClick={onExit} className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center text-ink-muted">
          <X size={18} />
        </button>
        <div className="text-center">
          <p className="text-xs text-ink-muted font-bold">كلمات مقلوبة</p>
          <p className="text-sm font-black">
            الجولة <span className="text-primary">{roundIndex}</span> / {totalRounds}
          </p>
        </div>
        <div className="w-9" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8 -mt-8">
        <AnimatePresence mode="wait">
          {phase === 'playing' && (
            <motion.div
              key="playing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-8 w-full"
            >
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`text-4xl font-black tabular-nums transition-colors ${
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

              <motion.div
                animate={shake ? { x: [0, -10, 10, -10, 10, 0] } : {}}
                transition={{ duration: 0.35 }}
                dir={rtl ? 'rtl' : 'ltr'}
                className="text-5xl sm:text-6xl font-black tracking-[0.2em] text-primary text-center break-all"
              >
                {scrambled}
              </motion.div>

              <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-3">
                <input
                  autoFocus
                  dir={rtl ? 'rtl' : 'ltr'}
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  placeholder="اكتب الإجابة..."
                  className="w-full text-center text-lg font-bold bg-surface border-2 border-line focus:border-primary rounded-btn px-4 py-3.5 outline-none transition-colors"
                />
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  type="submit"
                  className="w-full bg-primary text-primary-ink font-black text-lg rounded-btn py-3.5"
                >
                  إجابة
                </motion.button>
              </form>
            </motion.div>
          )}

          {phase === 'result' && resultInfo && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="flex flex-col items-center gap-3 text-center"
            >
              {resultInfo.winnerId ? (
                <>
                  <div className="text-6xl">{resultInfo.isMe ? '🎉' : '👏'}</div>
                  <p className="text-2xl font-black text-success">
                    {resultInfo.isMe ? 'صحيح!' : `${resultInfo.winnerName} جاوب صح`}
                  </p>
                  {resultInfo.isMe && <p className="text-primary font-bold text-lg">+100 نقطة</p>}
                </>
              ) : (
                <>
                  <div className="text-6xl">⏱️</div>
                  <p className="text-2xl font-black text-danger">خلص الوقت!</p>
                </>
              )}
              <p className="text-ink-muted">
                الكلمة كانت: <b className="text-ink">{resultInfo.word}</b>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
