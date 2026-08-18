import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { pickQuestion, evaluateTeam } from './logic'

const ANSWER_TIMEOUT_MS = 30000
const RESULT_PAUSE_MS = 4500
const RECENT_MEMORY = 8

export default function GameScreen({ code, profile, players, isHost, config, onExit, finishGame, channel }) {
  const [phase, setPhase] = useState('answering') // answering | result
  const [roundData, setRoundData] = useState(null)
  const [myAnswer, setMyAnswer] = useState('')
  const [haveAnswered, setHaveAnswered] = useState(false)
  const [answers, setAnswers] = useState({})
  const [lastResult, setLastResult] = useState(null)
  const [scores, setScores] = useState({})

  const channelRef = useRef(null)
  const answersRef = useRef({})
  const scoresRef = useRef({})
  const playersRef = useRef(players)
  const roundDataRef = useRef(null)
  const recentRef = useRef([])
  const answerTimerRef = useRef(null)
  const resolvedRef = useRef(null)

  const teams = config.teams || {}

  useEffect(() => {
    answersRef.current = answers
  }, [answers])
  useEffect(() => {
    scoresRef.current = scores
  }, [scores])
  useEffect(() => {
    playersRef.current = players
  }, [players])
  useEffect(() => {
    roundDataRef.current = roundData
  }, [roundData])

  const startRound = useCallback((index) => {
    const { idx, question } = pickQuestion(recentRef.current)
    recentRef.current = [idx, ...recentRef.current].slice(0, RECENT_MEMORY)
    const roundType = Math.random() < 0.5 ? 'match' : 'differ'
    const roundId = crypto.randomUUID()
    channelRef.current?.send({
      type: 'broadcast',
      event: 'matchdiffer-round-start',
      payload: { roundIndex: index, roundId, question, roundType },
    })
  }, [])

  const finalizeRound = useCallback(
    (roundId, roundIndex, question, roundType) => {
      if (resolvedRef.current === roundId) return
      resolvedRef.current = roundId
      if (answerTimerRef.current) clearTimeout(answerTimerRef.current)

      const allAnswers = answersRef.current
      const teamAAnswers = {}
      const teamBAnswers = {}
      for (const [pid, entry] of Object.entries(allAnswers)) {
        if (teams[pid] === 'A') teamAAnswers[pid] = entry.answer
        else if (teams[pid] === 'B') teamBAnswers[pid] = entry.answer
      }
      const aScored = evaluateTeam(teamAAnswers, roundType)
      const bScored = evaluateTeam(teamBAnswers, roundType)

      const newScores = { ...scoresRef.current }
      if (aScored) {
        for (const pid of Object.keys(teams).filter((id) => teams[id] === 'A')) {
          newScores[pid] = (newScores[pid] || 0) + 1
        }
      }
      if (bScored) {
        for (const pid of Object.keys(teams).filter((id) => teams[id] === 'B')) {
          newScores[pid] = (newScores[pid] || 0) + 1
        }
      }

      channelRef.current?.send({
        type: 'broadcast',
        event: 'matchdiffer-round-result',
        payload: { roundId, roundIndex, question, roundType, answers: allAnswers, aScored, bScored, scores: newScores },
      })
    },
    [teams]
  )

  useEffect(() => {
    if (!channel) return
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'matchdiffer-round-start' }, ({ payload }) => {
        answersRef.current = {}
        resolvedRef.current = null
        setAnswers({})
        setMyAnswer('')
        setHaveAnswered(false)
        setLastResult(null)
        setRoundData(payload)
        setPhase('answering')

        if (isHost) {
          if (answerTimerRef.current) clearTimeout(answerTimerRef.current)
          answerTimerRef.current = setTimeout(() => {
            finalizeRound(payload.roundId, payload.roundIndex, payload.question, payload.roundType)
          }, ANSWER_TIMEOUT_MS)
        }
      })
      .on('broadcast', { event: 'matchdiffer-answer' }, ({ payload }) => {
        answersRef.current = {
          ...answersRef.current,
          [payload.playerId]: { name: payload.playerName, answer: payload.answer },
        }
        setAnswers(answersRef.current)
        if (isHost && roundDataRef.current?.roundId === payload.roundId) {
          const total = Object.keys(playersRef.current).length
          if (Object.keys(answersRef.current).length >= total) {
            const rd = roundDataRef.current
            finalizeRound(payload.roundId, rd.roundIndex, rd.question, rd.roundType)
          }
        }
      })
      .on('broadcast', { event: 'matchdiffer-round-result' }, ({ payload }) => {
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
      channel
        .off('broadcast', { event: 'matchdiffer-round-start' })
        .off('broadcast', { event: 'matchdiffer-answer' })
        .off('broadcast', { event: 'matchdiffer-round-result' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel])

  function submitAnswer(e) {
    e.preventDefault()
    if (!myAnswer.trim() || haveAnswered || !roundData) return
    setHaveAnswered(true)
    channelRef.current?.send({
      type: 'broadcast',
      event: 'matchdiffer-answer',
      payload: { roundId: roundData.roundId, playerId: profile.id, playerName: profile.display_name, answer: myAnswer.trim() },
    })
  }

  const myTeam = teams[profile.id]
  const teamAList = Object.keys(teams).filter((id) => teams[id] === 'A')
  const teamBList = Object.keys(teams).filter((id) => teams[id] === 'B')

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
          <p className="text-xs text-ink-muted font-bold">نختلف ونتشابه</p>
          <p className="text-sm font-black">
            الجولة <span className="text-primary">{roundData?.roundIndex || 1}</span> / {config.rounds}
          </p>
        </div>
        <div className="w-9" />
      </div>

      <div className="flex-1 flex flex-col items-center px-6 gap-5 overflow-y-auto py-6">
        <AnimatePresence mode="wait">
          {phase === 'answering' && roundData && (
            <motion.div
              key="answering"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-5 w-full max-w-sm"
            >
              <span
                className={`text-sm font-black rounded-pill px-4 py-1.5 ${
                  roundData.roundType === 'match' ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent'
                }`}
              >
                {roundData.roundType === 'match' ? '🤝 تشابهوا' : '↔️ اختلفوا'}
              </span>
              <div className="w-full rounded-card shadow-pop p-6 flex flex-col items-center gap-2 text-center bg-primary-soft">
                <p className="text-xl font-black text-primary">{roundData.question}</p>
              </div>
              <p className="text-xs text-ink-muted">
                إنت بفريق {myTeam === 'A' ? 'أ' : 'ب'} — نسّق مع فريقك بدون ما تشوف جوابهم!
              </p>

              {haveAnswered ? (
                <p className="text-ink-muted font-bold">
                  بانتظار الباقين... ({Object.keys(answers).length}/{Object.keys(players).length})
                </p>
              ) : (
                <form onSubmit={submitAnswer} className="w-full flex flex-col gap-3">
                  <input
                    autoFocus
                    value={myAnswer}
                    onChange={(e) => setMyAnswer(e.target.value)}
                    placeholder="اكتب جوابك..."
                    className="w-full text-center font-bold bg-surface border-2 border-line focus:border-primary rounded-btn px-4 py-3 outline-none transition-colors"
                  />
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    type="submit"
                    disabled={!myAnswer.trim()}
                    className="w-full bg-primary text-primary-ink font-black text-lg rounded-btn py-3.5 disabled:opacity-40"
                  >
                    تم ✅
                  </motion.button>
                </form>
              )}
            </motion.div>
          )}

          {phase === 'result' && lastResult && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center gap-4 w-full max-w-sm text-center"
            >
              <p className="font-bold text-ink-muted">{lastResult.question}</p>
              <span
                className={`text-sm font-black rounded-pill px-4 py-1.5 ${
                  lastResult.roundType === 'match' ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent'
                }`}
              >
                {lastResult.roundType === 'match' ? '🤝 تشابهوا' : '↔️ اختلفوا'}
              </span>

              <div className="w-full flex gap-3">
                <div
                  className={`flex-1 rounded-card p-4 border-2 ${
                    lastResult.aScored ? 'border-success bg-success-soft' : 'border-line bg-surface'
                  }`}
                >
                  <p className="font-black mb-2">فريق أ {lastResult.aScored ? '✅ +1' : '❌'}</p>
                  {teamAList.map((pid) => (
                    <p key={pid} className="text-xs">
                      {lastResult.answers[pid]?.name}: <b>{lastResult.answers[pid]?.answer || '—'}</b>
                    </p>
                  ))}
                </div>
                <div
                  className={`flex-1 rounded-card p-4 border-2 ${
                    lastResult.bScored ? 'border-success bg-success-soft' : 'border-line bg-surface'
                  }`}
                >
                  <p className="font-black mb-2">فريق ب {lastResult.bScored ? '✅ +1' : '❌'}</p>
                  {teamBList.map((pid) => (
                    <p key={pid} className="text-xs">
                      {lastResult.answers[pid]?.name}: <b>{lastResult.answers[pid]?.answer || '—'}</b>
                    </p>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
