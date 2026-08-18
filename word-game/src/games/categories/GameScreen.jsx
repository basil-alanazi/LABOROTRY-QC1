import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

const FIELDS = [
  { key: 'jamad', label: 'جماد' },
  { key: 'nabat', label: 'نبات' },
  { key: 'insan', label: 'إنسان' },
  { key: 'balad', label: 'بلد' },
]

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
}) {
  const [answers, setAnswers] = useState({ jamad: '', nabat: '', insan: '', balad: '' })
  const [shake, setShake] = useState(false)

  const letter = roundData?.letter || ''
  const urgent = timeLeft <= 5
  const allFilled = FIELDS.every((f) => answers[f.key].trim())

  function updateField(key, value) {
    setAnswers((a) => ({ ...a, [key]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (phase !== 'playing' || !allFilled) return
    const ok = onSubmitGuess(answers)
    if (ok) {
      setAnswers({ jamad: '', nabat: '', insan: '', balad: '' })
    } else {
      setShake(true)
      setTimeout(() => setShake(false), 350)
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
          <p className="text-xs text-ink-muted font-bold">جماد نبات إنسان بلد</p>
          <p className="text-sm font-black">
            الجولة <span className="text-primary">{roundIndex}</span> / {totalRounds}
          </p>
        </div>
        <div className="w-9" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5 overflow-y-auto py-6">
        <AnimatePresence mode="wait">
          {phase === 'playing' && (
            <motion.div
              key="playing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-5 w-full max-w-xs"
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

              <div className="flex flex-col items-center gap-1">
                <p className="text-sm text-ink-muted font-bold">الحرف</p>
                <div className="text-6xl font-black text-primary">{letter}</div>
              </div>

              <motion.form
                animate={shake ? { x: [0, -10, 10, -10, 10, 0] } : {}}
                transition={{ duration: 0.35 }}
                onSubmit={handleSubmit}
                className="w-full flex flex-col gap-2.5"
              >
                {FIELDS.map((f) => (
                  <input
                    key={f.key}
                    dir="rtl"
                    value={answers[f.key]}
                    onChange={(e) => updateField(f.key, e.target.value)}
                    placeholder={f.label}
                    className="w-full text-center font-bold bg-surface border-2 border-line focus:border-primary rounded-btn px-4 py-2.5 outline-none transition-colors"
                  />
                ))}
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  type="submit"
                  disabled={!allFilled}
                  className="w-full bg-primary text-primary-ink font-black text-lg rounded-btn py-3.5 disabled:opacity-40"
                >
                  إجابة
                </motion.button>
              </motion.form>
            </motion.div>
          )}

          {phase === 'result' && resultInfo && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="flex flex-col items-center gap-3 text-center w-full max-w-xs"
            >
              {resultInfo.winnerId ? (
                <>
                  <div className="text-6xl">{resultInfo.isMe ? '🎉' : '👏'}</div>
                  <p className="text-2xl font-black text-success">
                    {resultInfo.isMe ? 'صحيح!' : `${resultInfo.winnerName} جاوب صح`}
                  </p>
                  {resultInfo.isMe && <p className="text-primary font-bold text-lg">+100 نقطة</p>}
                  {resultInfo.answer && (
                    <div className="w-full bg-surface border border-line rounded-card p-4 flex flex-col gap-1.5 text-start">
                      {FIELDS.map((f) => (
                        <p key={f.key} className="text-sm">
                          <span className="text-ink-muted font-bold">{f.label}: </span>
                          <span className="font-bold">{resultInfo.answer[f.key]}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-6xl">⏱️</div>
                  <p className="text-2xl font-black text-danger">خلص الوقت!</p>
                  <p className="text-ink-muted">
                    الحرف كان: <b className="text-ink">{resultInfo.word}</b>
                  </p>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
