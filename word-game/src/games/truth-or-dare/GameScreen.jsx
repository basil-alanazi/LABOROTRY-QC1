import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

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
  const isTruth = roundData?.type === 'truth'
  const urgent = timeLeft <= 5

  function handleDone() {
    if (phase !== 'playing') return
    onSubmitGuess({})
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
          <p className="text-xs text-ink-muted font-bold">صراحة ولا جرأة</p>
          <p className="text-sm font-black">
            الجولة <span className="text-primary">{roundIndex}</span> / {totalRounds}
          </p>
        </div>
        <div className="w-9" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        <AnimatePresence mode="wait">
          {phase === 'playing' && (
            <motion.div
              key="playing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-6 w-full max-w-sm"
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

              <motion.div
                initial={{ rotateY: 90 }}
                animate={{ rotateY: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 18 }}
                className={`w-full rounded-card shadow-pop p-8 flex flex-col items-center gap-4 text-center ${
                  isTruth ? 'bg-primary-soft' : 'bg-accent-soft'
                }`}
              >
                <span className="text-5xl">{isTruth ? '🤫' : '🔥'}</span>
                <p className={`font-black text-lg ${isTruth ? 'text-primary' : 'text-accent'}`}>
                  {isTruth ? 'صراحة' : 'جرأة'}
                </p>
                <p className="text-xl font-bold text-ink leading-relaxed">{roundData?.text}</p>
              </motion.div>

              <p className="text-xs text-ink-muted text-center">
                أول واحد يسوي التحدي أو يجاوب بصراحة يضغط الزر ياخذ النقطة
              </p>

              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleDone}
                className="w-full bg-primary text-primary-ink font-black text-lg rounded-btn py-3.5"
              >
                خلصت ✅
              </motion.button>
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
                    {resultInfo.isMe ? 'تم!' : `${resultInfo.winnerName} خلص أول`}
                  </p>
                  {resultInfo.isMe && <p className="text-primary font-bold text-lg">+100 نقطة</p>}
                </>
              ) : (
                <>
                  <div className="text-6xl">⏱️</div>
                  <p className="text-2xl font-black text-danger">خلص الوقت!</p>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
