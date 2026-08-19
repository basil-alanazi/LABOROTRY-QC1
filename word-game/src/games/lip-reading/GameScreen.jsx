import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'
import { pickWord } from './logic'

const ANSWER_TIMEOUT_MS = 40000
const RESULT_PAUSE_MS = 4000
const RECENT_MEMORY = 10

export default function LipReadingGameScreen({ profile, players, isHost, config, onExit, finishGame, channel }) {
  const [phase, setPhase] = useState('speaking') // speaking | result
  const [roundData, setRoundData] = useState(null)
  const [lastResult, setLastResult] = useState(null)
  const [scores, setScores] = useState({})

  const channelRef = useRef(null)
  const scoresRef = useRef({})
  const playersRef = useRef(players)
  const roundDataRef = useRef(null)
  const recentRef = useRef([])
  const orderRef = useRef(null)
  const answerTimerRef = useRef(null)
  const resolvedRef = useRef(null)

  useEffect(() => {
    scoresRef.current = scores
  }, [scores])
  useEffect(() => {
    playersRef.current = players
  }, [players])
  useEffect(() => {
    roundDataRef.current = roundData
  }, [roundData])

  const isSpeaker = roundData?.speakerId === profile.id

  const startRound = useCallback((index) => {
    if (!orderRef.current) {
      orderRef.current = Object.keys(playersRef.current).sort(() => Math.random() - 0.5)
    }
    const order = orderRef.current
    const speakerId = order[(index - 1) % order.length]
    const speakerName = playersRef.current[speakerId]?.name || '؟'
    const { idx, word } = pickWord(recentRef.current)
    recentRef.current = [idx, ...recentRef.current].slice(0, RECENT_MEMORY)
    const roundId = crypto.randomUUID()
    channelRef.current?.send({
      type: 'broadcast',
      event: 'lips-round-start',
      payload: { roundIndex: index, roundId, speakerId, speakerName, word },
    })
  }, [])

  const finishRound = useCallback((roundId, roundIndex, winnerId, winnerName, word) => {
    if (resolvedRef.current === roundId) return
    resolvedRef.current = roundId
    if (answerTimerRef.current) clearTimeout(answerTimerRef.current)

    const rd = roundDataRef.current
    const newScores = { ...scoresRef.current }
    if (winnerId) {
      newScores[winnerId] = (newScores[winnerId] || 0) + 100
      if (rd?.speakerId) newScores[rd.speakerId] = (newScores[rd.speakerId] || 0) + 50
    }

    channelRef.current?.send({
      type: 'broadcast',
      event: 'lips-round-result',
      payload: { roundId, roundIndex, winnerId, winnerName, word, scores: newScores },
    })
  }, [])

  useEffect(() => {
    if (!channel) return
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'lips-round-start' }, ({ payload }) => {
        resolvedRef.current = null
        setLastResult(null)
        setRoundData(payload)
        setPhase('speaking')

        if (isHost) {
          if (answerTimerRef.current) clearTimeout(answerTimerRef.current)
          answerTimerRef.current = setTimeout(() => {
            finishRound(payload.roundId, payload.roundIndex, null, null, payload.word)
          }, ANSWER_TIMEOUT_MS)
        }
      })
      .on('broadcast', { event: 'lips-round-result' }, ({ payload }) => {
        setLastResult(payload)
        setScores(payload.scores)
        setPhase('result')
        if (isHost) {
          setTimeout(() => {
            if (payload.roundIndex >= config.rounds) {
              finishGame(payload.scores)
            } else {
              startRound(payload.roundIndex + 1)
            }
          }, RESULT_PAUSE_MS)
        }
      })

    if (isHost) {
      setTimeout(() => startRound(1), 400)
    }

    return () => {
      if (answerTimerRef.current) clearTimeout(answerTimerRef.current)
      channel.off('broadcast', { event: 'lips-round-start' }).off('broadcast', { event: 'lips-round-result' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel])

  function awardWinner(winnerId) {
    if (!isSpeaker || !roundData) return
    const p = players[winnerId]
    finishRound(roundData.roundId, roundData.roundIndex, winnerId, p?.name, roundData.word)
  }

  function noOneKnew() {
    if (!isSpeaker || !roundData) return
    finishRound(roundData.roundId, roundData.roundIndex, null, null, roundData.word)
  }

  const others = Object.entries(players).filter(([id]) => id !== profile.id)

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
          <p className="text-xs text-ink-muted font-bold">اقرأ الشفايف</p>
          <p className="text-sm font-black">
            الجولة <span className="text-primary">{roundData?.roundIndex || 1}</span> / {config.rounds}
          </p>
        </div>
        <div className="w-9" />
      </div>

      <div className="flex-1 flex flex-col items-center px-6 gap-5 overflow-y-auto py-6">
        <AnimatePresence mode="wait">
          {phase === 'speaking' && roundData && (
            <motion.div
              key="speaking"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-5 w-full max-w-sm"
            >
              {isSpeaker ? (
                <>
                  <div className="w-full rounded-card shadow-pop p-6 flex flex-col items-center gap-2 text-center bg-primary-soft">
                    <span className="text-4xl">🤐</span>
                    <p className="text-xs text-ink-muted font-bold">حرّك شفايفك بدون ما تطلع صوت</p>
                    <p className="text-2xl font-black text-primary">{roundData.word}</p>
                  </div>
                  <p className="text-xs text-ink-muted text-center">لما حد يخمنها صح، اضغط على اسمه تحت</p>
                  <div className="w-full grid grid-cols-2 gap-2.5">
                    {others.map(([id, p]) => (
                      <button
                        key={id}
                        onClick={() => awardWinner(id)}
                        className="flex flex-col items-center gap-1.5 rounded-card p-3 border-2 border-line bg-surface hover:border-primary transition-colors"
                      >
                        <Avatar name={p.name} src={p.avatarUrl} size="md" />
                        <span className="text-xs font-bold truncate w-full text-center">{p.name}</span>
                      </button>
                    ))}
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={noOneKnew}
                    className="w-full bg-surface-2 text-ink-muted font-black text-sm rounded-btn py-3"
                  >
                    محد عرفها ⏱️
                  </motion.button>
                </>
              ) : (
                <div className="w-full rounded-card shadow-pop p-8 flex flex-col items-center gap-3 text-center bg-primary-soft">
                  <span className="text-5xl">👀</span>
                  <p className="font-black text-lg">
                    {roundData.speakerName} يحرّك شفايفه الحين
                  </p>
                  <p className="text-sm text-ink-muted">خمّنوا بصوت عالي — محد يكتب ولا شي، اللعبة بره الجوال!</p>
                </div>
              )}
            </motion.div>
          )}

          {phase === 'result' && lastResult && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center gap-3 text-center w-full max-w-sm"
            >
              <span className="text-6xl">💋</span>
              <p className="text-xl font-black text-primary">الكلمة كانت: {lastResult.word}</p>
              {lastResult.winnerId ? (
                <p className="font-bold text-lg text-success">
                  {lastResult.winnerName} خمنها صح! 🎉 <span className="text-primary">+100</span>
                </p>
              ) : (
                <p className="font-bold text-lg text-danger">محد عرفها ⏱️</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
