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
  const teamOrderRef = useRef(null)
  const answerTimerRef = useRef(null)
  const resolvedRef = useRef(null)

  const teams = config.teams || {}

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
  const myTeam = teams[profile.id]
  const onActiveTeam = roundData && myTeam === roundData.activeTeam

  const startRound = useCallback((index) => {
    if (!teamOrderRef.current) {
      const teamA = Object.keys(teams)
        .filter((id) => teams[id] === 'A')
        .sort(() => Math.random() - 0.5)
      const teamB = Object.keys(teams)
        .filter((id) => teams[id] === 'B')
        .sort(() => Math.random() - 0.5)
      teamOrderRef.current = { A: teamA, B: teamB }
    }
    const activeTeam = index % 2 === 1 ? 'A' : 'B'
    const teamMembers = teamOrderRef.current[activeTeam]
    const turnsForThisTeam = Math.ceil(index / 2) - 1
    const speakerId = teamMembers[turnsForThisTeam % teamMembers.length]
    const speakerName = playersRef.current[speakerId]?.name || '؟'
    const { idx, word } = pickWord(recentRef.current)
    recentRef.current = [idx, ...recentRef.current].slice(0, RECENT_MEMORY)
    const roundId = crypto.randomUUID()
    channelRef.current?.send({
      type: 'broadcast',
      event: 'lips-round-start',
      payload: { roundIndex: index, roundId, activeTeam, speakerId, speakerName, word },
    })
  }, [teams])

  const finishRound = useCallback(
    (roundId, roundIndex, activeTeam, winnerId, winnerName, word) => {
      if (resolvedRef.current === roundId) return
      resolvedRef.current = roundId
      if (answerTimerRef.current) clearTimeout(answerTimerRef.current)

      const newScores = { ...scoresRef.current }
      if (winnerId) {
        const teamMembers = Object.keys(teams).filter((id) => teams[id] === activeTeam)
        for (const pid of teamMembers) newScores[pid] = (newScores[pid] || 0) + 100
      }

      channelRef.current?.send({
        type: 'broadcast',
        event: 'lips-round-result',
        payload: { roundId, roundIndex, activeTeam, winnerId, winnerName, word, scores: newScores },
      })
    },
    [teams]
  )

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
            finishRound(payload.roundId, payload.roundIndex, payload.activeTeam, null, null, payload.word)
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
    finishRound(roundData.roundId, roundData.roundIndex, roundData.activeTeam, winnerId, p?.name, roundData.word)
  }

  function noOneKnew() {
    if (!isSpeaker || !roundData) return
    finishRound(roundData.roundId, roundData.roundIndex, roundData.activeTeam, null, null, roundData.word)
  }

  const teammates = Object.entries(players).filter(([id]) => teams[id] === myTeam && id !== profile.id)

  const teamScore = (t) =>
    Object.keys(teams)
      .filter((id) => teams[id] === t)
      .reduce((sum, id) => sum + (scores[id] || 0), 0)

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

      <div className="flex items-center justify-center gap-4 px-5 pt-3">
        <div className={`flex-1 max-w-[9rem] rounded-btn py-2 text-center font-black ${roundData?.activeTeam === 'A' ? 'bg-primary-soft text-primary' : 'bg-surface-2 text-ink-muted'}`}>
          فريق أ · {teamScore('A')}
        </div>
        <div className={`flex-1 max-w-[9rem] rounded-btn py-2 text-center font-black ${roundData?.activeTeam === 'B' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-muted'}`}>
          فريق ب · {teamScore('B')}
        </div>
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
                    <p className="text-xs text-ink-muted font-bold">حرّك شفايفك بدون ما تطلع صوت لفريقك</p>
                    <p className="text-2xl font-black text-primary">{roundData.word}</p>
                  </div>
                  <p className="text-xs text-ink-muted text-center">لما أحد فريقك يخمنها صح، اضغط على اسمه تحت</p>
                  <div className="w-full grid grid-cols-2 gap-2.5">
                    {teammates.map(([id, p]) => (
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
              ) : onActiveTeam ? (
                <div className="w-full rounded-card shadow-pop p-8 flex flex-col items-center gap-3 text-center bg-primary-soft">
                  <span className="text-5xl">👀</span>
                  <p className="font-black text-lg">{roundData.speakerName} من فريقك يحرّك شفايفه الحين</p>
                  <p className="text-sm text-ink-muted">خمّن بصوت عالي — محد يكتب ولا شي، اللعبة بره الجوال!</p>
                </div>
              ) : (
                <div className="w-full rounded-card shadow-pop p-8 flex flex-col items-center gap-3 text-center bg-surface-2">
                  <span className="text-5xl">⏳</span>
                  <p className="font-black text-lg">فريق {roundData.activeTeam === 'A' ? 'أ' : 'ب'} يلعب الحين</p>
                  <p className="text-sm text-ink-muted">استنوا دوركم، وحاولوا ما تساعدونهم 😉</p>
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
                  {lastResult.winnerName} خمنها صح! فريق {lastResult.activeTeam === 'A' ? 'أ' : 'ب'} ياخذ{' '}
                  <span className="text-primary">+100</span> لكل عضو 🎉
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
