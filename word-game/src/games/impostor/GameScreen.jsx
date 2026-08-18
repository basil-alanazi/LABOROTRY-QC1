import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { pickQuestionPair } from './logic'
import Avatar from '../../components/ui/Avatar'

const ANSWER_TIMEOUT_MS = 60000
const VOTE_TIMEOUT_MS = 45000
const RESULT_PAUSE_MS = 4500
const RECENT_MEMORY = 6
const DOUBLE_IMPOSTOR_CHANCE = 0.25
const MIN_PLAYERS_FOR_DOUBLE = 5

export default function ImpostorGameScreen({ code, profile, players, isHost, config, onExit, finishGame }) {
  const [phase, setPhase] = useState('waiting') // waiting | answering | reveal | voting | result
  const [roundData, setRoundData] = useState(null)
  const [answers, setAnswers] = useState({})
  const [myAnswer, setMyAnswer] = useState('')
  const [haveAnswered, setHaveAnswered] = useState(false)
  const [selectedVotes, setSelectedVotes] = useState([])
  const [haveVoted, setHaveVoted] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [scores, setScores] = useState({})

  const channelRef = useRef(null)
  const scoresRef = useRef({})
  const answersRef = useRef({})
  const votesRef = useRef({})
  const recentRef = useRef([])
  const playersRef = useRef(players)
  const roundDataRef = useRef(null)
  const answerTimerRef = useRef(null)
  const voteTimerRef = useRef(null)
  const resolvedAnswerRef = useRef(null)
  const resolvedVoteRef = useRef(null)

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
    const playerIds = Object.keys(playersRef.current)
    const shuffled = [...playerIds].sort(() => Math.random() - 0.5)
    const useTwo = playerIds.length >= MIN_PLAYERS_FOR_DOUBLE && Math.random() < DOUBLE_IMPOSTOR_CHANCE
    const impostorIds = shuffled.slice(0, useTwo ? 2 : 1)
    const { idx, pair } = pickQuestionPair(recentRef.current)
    recentRef.current = [idx, ...recentRef.current].slice(0, RECENT_MEMORY)
    const roundId = crypto.randomUUID()
    channelRef.current?.send({
      type: 'broadcast',
      event: 'impostor-round-start',
      payload: {
        roundIndex: index,
        roundId,
        normalQuestion: pair.normal,
        impostorQuestion: pair.impostor,
        impostorIds,
      },
    })
  }, [])

  const finishRound = useCallback((roundId, roundIndex, impostorIds, normalQuestion, impostorQuestion) => {
    if (resolvedVoteRef.current === roundId) return
    resolvedVoteRef.current = roundId
    if (voteTimerRef.current) clearTimeout(voteTimerRef.current)

    const currentVotes = votesRef.current
    const pointsGained = {}
    for (const impId of impostorIds) {
      const catchers = Object.entries(currentVotes)
        .filter(([, votedIds]) => votedIds.includes(impId))
        .map(([voterId]) => voterId)
      if (catchers.length > 0) {
        catchers.forEach((voterId) => {
          pointsGained[voterId] = (pointsGained[voterId] || 0) + 1
        })
      } else {
        pointsGained[impId] = (pointsGained[impId] || 0) + 2
      }
    }
    const newScores = { ...scoresRef.current }
    for (const [pid, pts] of Object.entries(pointsGained)) {
      newScores[pid] = (newScores[pid] || 0) + pts
    }

    channelRef.current?.send({
      type: 'broadcast',
      event: 'impostor-round-result',
      payload: {
        roundId,
        roundIndex,
        impostorIds,
        normalQuestion,
        impostorQuestion,
        votes: currentVotes,
        pointsGained,
        scores: newScores,
      },
    })
  }, [])

  useEffect(() => {
    const channel = supabase.channel(`session-${code}`, { config: { broadcast: { self: true } } })
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'impostor-round-start' }, ({ payload }) => {
        answersRef.current = {}
        votesRef.current = {}
        resolvedAnswerRef.current = null
        resolvedVoteRef.current = null
        setAnswers({})
        setMyAnswer('')
        setHaveAnswered(false)
        setSelectedVotes([])
        setHaveVoted(false)
        setLastResult(null)
        const isImp = payload.impostorIds.includes(profile.id)
        setRoundData({
          ...payload,
          myQuestion: isImp ? payload.impostorQuestion : payload.normalQuestion,
          isImpostor: isImp,
        })
        setPhase('answering')

        if (isHost) {
          if (answerTimerRef.current) clearTimeout(answerTimerRef.current)
          answerTimerRef.current = setTimeout(() => {
            if (resolvedAnswerRef.current === payload.roundId) return
            resolvedAnswerRef.current = payload.roundId
            channel.send({
              type: 'broadcast',
              event: 'impostor-reveal',
              payload: { roundId: payload.roundId, answers: answersRef.current },
            })
          }, ANSWER_TIMEOUT_MS)
        }
      })
      .on('broadcast', { event: 'impostor-answer' }, ({ payload }) => {
        answersRef.current = {
          ...answersRef.current,
          [payload.playerId]: { name: payload.playerName, answer: payload.answer },
        }
        setAnswers(answersRef.current)
        if (isHost && roundDataRef.current?.roundId === payload.roundId) {
          const total = Object.keys(playersRef.current).length
          if (Object.keys(answersRef.current).length >= total && resolvedAnswerRef.current !== payload.roundId) {
            resolvedAnswerRef.current = payload.roundId
            if (answerTimerRef.current) clearTimeout(answerTimerRef.current)
            channel.send({
              type: 'broadcast',
              event: 'impostor-reveal',
              payload: { roundId: payload.roundId, answers: answersRef.current },
            })
          }
        }
      })
      .on('broadcast', { event: 'impostor-reveal' }, ({ payload }) => {
        answersRef.current = payload.answers
        setAnswers(payload.answers)
        setPhase('reveal')
      })
      .on('broadcast', { event: 'impostor-open-voting' }, ({ payload }) => {
        setPhase('voting')
        if (isHost) {
          if (voteTimerRef.current) clearTimeout(voteTimerRef.current)
          voteTimerRef.current = setTimeout(() => {
            const rd = roundDataRef.current
            finishRound(payload.roundId, rd.roundIndex, rd.impostorIds, rd.normalQuestion, rd.impostorQuestion)
          }, VOTE_TIMEOUT_MS)
        }
      })
      .on('broadcast', { event: 'impostor-vote' }, ({ payload }) => {
        votesRef.current = { ...votesRef.current, [payload.voterId]: payload.votedForIds }
        if (isHost && roundDataRef.current?.roundId === payload.roundId) {
          const total = Object.keys(playersRef.current).length
          if (Object.keys(votesRef.current).length >= total) {
            const rd = roundDataRef.current
            finishRound(payload.roundId, rd.roundIndex, rd.impostorIds, rd.normalQuestion, rd.impostorQuestion)
          }
        }
      })
      .on('broadcast', { event: 'impostor-round-result' }, ({ payload }) => {
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && isHost) {
          setTimeout(() => startRound(1), 400)
        }
      })

    return () => {
      if (answerTimerRef.current) clearTimeout(answerTimerRef.current)
      if (voteTimerRef.current) clearTimeout(voteTimerRef.current)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  function submitAnswer(e) {
    e.preventDefault()
    if (!myAnswer.trim() || haveAnswered || !roundData) return
    setHaveAnswered(true)
    channelRef.current?.send({
      type: 'broadcast',
      event: 'impostor-answer',
      payload: { roundId: roundData.roundId, playerId: profile.id, playerName: profile.display_name, answer: myAnswer.trim() },
    })
  }

  function toggleVote(playerId) {
    if (haveVoted) return
    setSelectedVotes((v) => (v.includes(playerId) ? v.filter((id) => id !== playerId) : [...v, playerId]))
  }

  function confirmVote() {
    if (haveVoted || !roundData) return
    setHaveVoted(true)
    channelRef.current?.send({
      type: 'broadcast',
      event: 'impostor-vote',
      payload: { roundId: roundData.roundId, voterId: profile.id, votedForIds: selectedVotes },
    })
  }

  function openVoting() {
    if (!roundData) return
    channelRef.current?.send({ type: 'broadcast', event: 'impostor-open-voting', payload: { roundId: roundData.roundId } })
  }

  const others = Object.entries(players).filter(([id]) => id !== profile.id)
  const answerEntries = Object.entries(answers)

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
              <div className="w-full rounded-card shadow-pop p-6 flex flex-col items-center gap-2 text-center bg-primary-soft">
                <span className="text-4xl">❓</span>
                <p className="text-xl font-black text-primary">{roundData.myQuestion}</p>
              </div>

              {haveAnswered ? (
                <p className="text-ink-muted font-bold">بانتظار باقي اللاعبين... ({answerEntries.length}/{Object.keys(players).length})</p>
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

          {phase === 'reveal' && (
            <motion.div
              key="reveal"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-4 w-full max-w-sm"
            >
              <div className="w-full rounded-card p-4 text-center bg-surface-2">
                <p className="text-xs text-ink-muted font-bold mb-1">السؤال</p>
                <p className="font-black text-primary">{roundData?.normalQuestion}</p>
              </div>
              <div className="w-full flex flex-col gap-2">
                {answerEntries.map(([id, a]) => (
                  <div key={id} className="flex items-center gap-3 bg-surface border border-line rounded-btn px-3 py-2.5">
                    <Avatar name={a.name} size="sm" />
                    <span className="font-bold text-sm">{a.name}:</span>
                    <span className="font-bold text-sm flex-1">{a.answer}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-muted text-center">ناقشوا الإجابات، وبعدين اضغطوا اذهب للتصويت</p>
              <motion.button whileTap={{ scale: 0.96 }} onClick={openVoting} className="w-full bg-accent text-accent-ink font-black text-lg rounded-btn py-3.5">
                🗳️ اذهب للتصويت
              </motion.button>
            </motion.div>
          )}

          {phase === 'voting' && (
            <motion.div
              key="voting"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-4 w-full max-w-sm"
            >
              <p className="font-bold text-sm text-ink-muted text-center">مين تشك إنه الإمبوستر؟ (تقدر تختار أكثر من واحد)</p>
              <div className="w-full grid grid-cols-2 gap-2.5">
                {others.map(([id, p]) => (
                  <button
                    key={id}
                    disabled={haveVoted}
                    onClick={() => toggleVote(id)}
                    className={`flex flex-col items-center gap-1.5 rounded-card p-3 border-2 transition-colors ${
                      selectedVotes.includes(id) ? 'border-danger bg-danger-soft' : 'border-line bg-surface'
                    }`}
                  >
                    <Avatar name={p.name} src={p.avatarUrl} size="md" />
                    <span className="text-xs font-bold truncate w-full text-center">{p.name}</span>
                  </button>
                ))}
              </div>
              {haveVoted ? (
                <p className="text-ink-muted font-bold">بانتظار باقي اللاعبين يصوتون...</p>
              ) : (
                <motion.button whileTap={{ scale: 0.96 }} onClick={confirmVote} className="w-full bg-primary text-primary-ink font-black text-lg rounded-btn py-3.5">
                  تأكيد التصويت
                </motion.button>
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
              <span className="text-6xl">🕵️</span>
              <p className="text-xl font-black text-danger">
                {lastResult.impostorIds.length > 1 ? 'الإمبوسترات كانوا:' : 'الإمبوستر كان:'}
              </p>
              <p className="font-bold text-lg">
                {lastResult.impostorIds.map((id) => players[id]?.name || '؟').join(' و ')}
              </p>
              <p className="text-ink-muted text-sm">سؤالهم كان: {lastResult.impostorQuestion}</p>

              {lastResult.pointsGained && Object.keys(lastResult.pointsGained).length > 0 && (
                <div className="w-full bg-surface border border-line rounded-card p-4 flex flex-col gap-1.5 mt-2">
                  {Object.entries(lastResult.pointsGained).map(([pid, pts]) => (
                    <p key={pid} className="text-sm font-bold">
                      {players[pid]?.name || '؟'}: <span className="text-primary">+{pts}</span>
                    </p>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
