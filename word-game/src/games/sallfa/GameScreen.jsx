import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'
import { CATEGORIES, randomCategory, pickWordPair } from './logic'

const VOTE_TIMEOUT_MS = 45000
const GUESS_TIMEOUT_MS = 30000
const RESULT_PAUSE_MS = 5500
const RECENT_MEMORY = 6

export default function SallfaGameScreen({ code, profile, players, isHost, config, onExit, finishGame, channel }) {
  const [phase, setPhase] = useState('category') // category | reveal | voting | guess | result
  const [roundData, setRoundData] = useState(null)
  const [myVote, setMyVote] = useState(null)
  const [haveVoted, setHaveVoted] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [scores, setScores] = useState({})

  const channelRef = useRef(null)
  const scoresRef = useRef({})
  const playersRef = useRef(players)
  const roundDataRef = useRef(null)
  const recentRef = useRef([])
  const votesRef = useRef({})
  const voteTimerRef = useRef(null)
  const guessTimerRef = useRef(null)
  const resultTimerRef = useRef(null)
  const resolvedVoteRef = useRef(null)
  const resolvedGuessRef = useRef(null)

  useEffect(() => {
    scoresRef.current = scores
  }, [scores])
  useEffect(() => {
    playersRef.current = players
  }, [players])
  useEffect(() => {
    roundDataRef.current = roundData
  }, [roundData])

  const isOutsider = roundData?.outsiderId === profile.id

  const startRound = useCallback((index, category) => {
    const cat = category || randomCategory()
    const { key, normalWord, outsiderWord } = pickWordPair(cat, recentRef.current)
    recentRef.current = [key, ...recentRef.current].slice(0, RECENT_MEMORY)
    const playerIds = Object.keys(playersRef.current)
    const outsiderId = playerIds[Math.floor(Math.random() * playerIds.length)]
    const roundId = crypto.randomUUID()
    channelRef.current?.send({
      type: 'broadcast',
      event: 'sallfa-round-start',
      payload: { roundIndex: index, roundId, category: cat, normalWord, outsiderWord, outsiderId },
    })
  }, [])

  const openVoting = useCallback(() => {
    const rd = roundDataRef.current
    if (!rd) return
    channelRef.current?.send({ type: 'broadcast', event: 'sallfa-open-voting', payload: { roundId: rd.roundId } })
  }, [])

  const resolveVoting = useCallback((roundId) => {
    if (resolvedVoteRef.current === roundId) return
    resolvedVoteRef.current = roundId
    if (voteTimerRef.current) clearTimeout(voteTimerRef.current)

    const rd = roundDataRef.current
    const catcherIds = Object.entries(votesRef.current)
      .filter(([, votedForId]) => votedForId === rd.outsiderId)
      .map(([voterId]) => voterId)

    channelRef.current?.send({
      type: 'broadcast',
      event: 'sallfa-open-guess',
      payload: { roundId, catcherIds },
    })
  }, [])

  const resolveGuess = useCallback((roundId, catcherIds, guessWord) => {
    if (resolvedGuessRef.current === roundId) return
    resolvedGuessRef.current = roundId
    if (guessTimerRef.current) clearTimeout(guessTimerRef.current)

    const rd = roundDataRef.current
    const caught = catcherIds.length > 0
    const guessCorrect = guessWord != null && guessWord === rd.normalWord

    const newScores = { ...scoresRef.current }
    for (const pid of catcherIds) {
      newScores[pid] = (newScores[pid] || 0) + 2
    }
    if (guessCorrect) {
      newScores[rd.outsiderId] = (newScores[rd.outsiderId] || 0) + (caught ? 1 : 3)
    }

    channelRef.current?.send({
      type: 'broadcast',
      event: 'sallfa-round-result',
      payload: {
        roundId,
        roundIndex: rd.roundIndex,
        category: rd.category,
        normalWord: rd.normalWord,
        outsiderWord: rd.outsiderWord,
        outsiderId: rd.outsiderId,
        catcherIds,
        guessWord,
        guessCorrect,
        scores: newScores,
      },
    })
  }, [])

  useEffect(() => {
    if (!channel) return
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'sallfa-round-start' }, ({ payload }) => {
        votesRef.current = {}
        resolvedVoteRef.current = null
        resolvedGuessRef.current = null
        setMyVote(null)
        setHaveVoted(false)
        setLastResult(null)
        setRoundData(payload)
        setPhase('reveal')
      })
      .on('broadcast', { event: 'sallfa-open-voting' }, ({ payload }) => {
        setPhase('voting')
        if (isHost) {
          if (voteTimerRef.current) clearTimeout(voteTimerRef.current)
          voteTimerRef.current = setTimeout(() => resolveVoting(payload.roundId), VOTE_TIMEOUT_MS)
        }
      })
      .on('broadcast', { event: 'sallfa-vote' }, ({ payload }) => {
        votesRef.current = { ...votesRef.current, [payload.voterId]: payload.votedForId }
        if (isHost && roundDataRef.current?.roundId === payload.roundId) {
          const total = Object.keys(playersRef.current).length - 1 // everyone except the outsider votes
          if (Object.keys(votesRef.current).length >= total) {
            resolveVoting(payload.roundId)
          }
        }
      })
      .on('broadcast', { event: 'sallfa-open-guess' }, ({ payload }) => {
        setLastResult((r) => ({ ...r, catcherIds: payload.catcherIds }))
        setPhase('guess')
        if (isHost) {
          if (guessTimerRef.current) clearTimeout(guessTimerRef.current)
          guessTimerRef.current = setTimeout(() => resolveGuess(payload.roundId, payload.catcherIds, null), GUESS_TIMEOUT_MS)
        }
      })
      .on('broadcast', { event: 'sallfa-guess' }, ({ payload }) => {
        if (isHost && roundDataRef.current?.roundId === payload.roundId) {
          resolveGuess(payload.roundId, payload.catcherIds, payload.guessWord)
        }
      })
      .on('broadcast', { event: 'sallfa-round-result' }, ({ payload }) => {
        setLastResult(payload)
        setScores(payload.scores)
        setPhase('result')
        if (isHost) {
          if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
          resultTimerRef.current = setTimeout(() => {
            if (payload.roundIndex >= config.rounds) {
              finishGame(payload.scores)
            }
          }, RESULT_PAUSE_MS)
        }
        setTimeout(() => {
          if (payload.roundIndex < config.rounds) setPhase('category')
        }, RESULT_PAUSE_MS)
      })

    return () => {
      if (voteTimerRef.current) clearTimeout(voteTimerRef.current)
      if (guessTimerRef.current) clearTimeout(guessTimerRef.current)
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
      channel
        .off('broadcast', { event: 'sallfa-round-start' })
        .off('broadcast', { event: 'sallfa-open-voting' })
        .off('broadcast', { event: 'sallfa-vote' })
        .off('broadcast', { event: 'sallfa-open-guess' })
        .off('broadcast', { event: 'sallfa-guess' })
        .off('broadcast', { event: 'sallfa-round-result' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel])

  function pickCategory(cat) {
    const nextIndex = (roundData?.roundIndex || 0) + 1
    startRound(nextIndex, cat)
  }

  function castVote(targetId) {
    if (haveVoted || !roundData || isOutsider) return
    setMyVote(targetId)
    setHaveVoted(true)
    channelRef.current?.send({
      type: 'broadcast',
      event: 'sallfa-vote',
      payload: { roundId: roundData.roundId, voterId: profile.id, votedForId: targetId },
    })
  }

  function submitGuess(word) {
    if (!roundData || !isOutsider) return
    channelRef.current?.send({
      type: 'broadcast',
      event: 'sallfa-guess',
      payload: { roundId: roundData.roundId, catcherIds: lastResult?.catcherIds || [], guessWord: word },
    })
  }

  const others = Object.entries(players).filter(([id]) => id !== profile.id)
  const myWord = roundData ? (isOutsider ? roundData.outsiderWord : roundData.normalWord) : null

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
          <p className="text-xs text-ink-muted font-bold">مين برا السالفة؟</p>
          <p className="text-sm font-black">
            الجولة <span className="text-primary">{roundData?.roundIndex || 1}</span> / {config.rounds}
          </p>
        </div>
        <div className="w-9" />
      </div>

      <div className="flex-1 flex flex-col items-center px-6 gap-5 overflow-y-auto py-6">
        <AnimatePresence mode="wait">
          {phase === 'category' && (
            <motion.div
              key="category"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-4 w-full max-w-sm"
            >
              {isHost ? (
                <>
                  <p className="font-black text-lg text-center">اختر فئة الجولة 🗂️</p>
                  <div className="w-full grid grid-cols-2 gap-2.5">
                    {Object.keys(CATEGORIES).map((cat) => (
                      <motion.button
                        key={cat}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => pickCategory(cat)}
                        className="bg-surface border-2 border-line hover:border-primary rounded-card py-3.5 font-black text-sm"
                      >
                        {cat}
                      </motion.button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 text-center">
                  <span className="text-5xl">🗂️</span>
                  <p className="font-bold text-ink-muted">بانتظار المضيف يختار فئة الجولة...</p>
                </div>
              )}
            </motion.div>
          )}

          {phase === 'reveal' && roundData && (
            <motion.div
              key="reveal"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-5 w-full max-w-sm"
            >
              <span className="text-xs font-black text-ink-muted bg-surface-2 rounded-pill px-4 py-1.5">
                الفئة: {roundData.category}
              </span>
              <div className="w-full rounded-card shadow-pop p-6 flex flex-col items-center gap-2 text-center bg-primary-soft">
                <span className="text-4xl">🤫</span>
                <p className="text-2xl font-black text-primary">{myWord}</p>
              </div>
              <p className="text-xs text-ink-muted text-center">
                ناقشوا واسألوا بعض بصوت عالي بدون ما تفضحون كلمتكم، وبعدها اذهبوا للتصويت
              </p>
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
              {isOutsider ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <span className="text-5xl">🙈</span>
                  <p className="font-bold text-ink-muted">إنت برا السالفة! بانتظار البقية يصوتون...</p>
                </div>
              ) : (
                <>
                  <p className="font-bold text-sm text-ink-muted text-center">مين تشك إنه برا السالفة؟ (اختر واحد بس)</p>
                  <div className="w-full grid grid-cols-2 gap-2.5">
                    {others.map(([id, p]) => (
                      <button
                        key={id}
                        disabled={haveVoted}
                        onClick={() => castVote(id)}
                        className={`flex flex-col items-center gap-1.5 rounded-card p-3 border-2 transition-colors ${
                          myVote === id ? 'border-danger bg-danger-soft' : 'border-line bg-surface'
                        }`}
                      >
                        <Avatar name={p.name} src={p.avatarUrl} size="md" />
                        <span className="text-xs font-bold truncate w-full text-center">{p.name}</span>
                      </button>
                    ))}
                  </div>
                  {haveVoted && <p className="text-ink-muted font-bold">بانتظار باقي اللاعبين يصوتون...</p>}
                </>
              )}
            </motion.div>
          )}

          {phase === 'guess' && roundData && (
            <motion.div
              key="guess"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-4 w-full max-w-sm"
            >
              {isOutsider ? (
                <>
                  <p className="font-black text-lg text-center">
                    {(lastResult?.catcherIds?.length || 0) > 0 ? 'مسكوك! 😅' : 'ما مسكوك! 🕵️'} خمن وش كانت السالفة الأصلية
                  </p>
                  <div className="w-full grid grid-cols-2 gap-2">
                    {CATEGORIES[roundData.category]
                      .filter((w) => w !== roundData.outsiderWord)
                      .map((w) => (
                        <motion.button
                          key={w}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => submitGuess(w)}
                          className="bg-surface border-2 border-line hover:border-primary rounded-btn py-2.5 font-bold text-sm"
                        >
                          {w}
                        </motion.button>
                      ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 text-center">
                  <span className="text-5xl">🤔</span>
                  <p className="font-bold text-ink-muted">
                    اللي برا السالفة يحاول يخمن الكلمة الأصلية الحين...
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {phase === 'result' && lastResult && roundData && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center gap-3 text-center w-full max-w-sm"
            >
              <span className="text-6xl">🕵️</span>
              <p className="text-xl font-black text-danger">اللي برا السالفة كان: {players[lastResult.outsiderId]?.name}</p>
              <p className="text-ink-muted text-sm">
                الفئة: {lastResult.category} — الكلمة الأصلية: <b>{lastResult.normalWord}</b> — كلمته: <b>{lastResult.outsiderWord}</b>
              </p>
              <p className="font-bold">
                {lastResult.catcherIds.length > 0
                  ? `مسكوه ✅ (${lastResult.catcherIds.map((id) => players[id]?.name).join('، ')}) — كل وحد +2`
                  : 'ما مسكوه أحد ❌'}
              </p>
              <p className="font-bold">
                {lastResult.guessCorrect
                  ? `وخمن الكلمة صح! +${lastResult.catcherIds.length > 0 ? 1 : 3} 🎉`
                  : 'وما عرف الكلمة الأصلية ❌'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
