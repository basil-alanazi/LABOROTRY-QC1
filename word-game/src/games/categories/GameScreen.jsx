import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Check, XCircle } from 'lucide-react'
import { FIELDS, pickLetter, startsWithLetter, scoreFieldWithOverrides } from './logic'

const GRACE_MS = 2500
const FINAL_TIMEOUT_MS = 8000
const REVIEW_TIMEOUT_MS = 30000
const RECENT_MEMORY = 6

const EMPTY_FIELDS = { jamad: '', nabat: '', hayawan: '', dawla: '', ismWalad: '', ismBint: '' }

export default function GameScreen({ code, profile, players, isHost, config, onExit, finishGame, channel }) {
  const [phase, setPhase] = useState('answering') // answering | stopped | review | result
  const [roundData, setRoundData] = useState(null)
  const [fields, setFields] = useState(EMPTY_FIELDS)
  const [stoppedByName, setStoppedByName] = useState(null)
  const [reviewSubmissions, setReviewSubmissions] = useState(null)
  const [overrides, setOverrides] = useState({})
  const [lastResult, setLastResult] = useState(null)
  const [scores, setScores] = useState({})

  const channelRef = useRef(null)
  const fieldsRef = useRef(EMPTY_FIELDS)
  const scoresRef = useRef({})
  const playersRef = useRef(players)
  const roundDataRef = useRef(null)
  const submissionsRef = useRef({})
  const overridesRef = useRef({})
  const recentRef = useRef([])
  const graceTimerRef = useRef(null)
  const finalTimerRef = useRef(null)
  const reviewTimerRef = useRef(null)
  const resolvedRef = useRef(null)
  const reviewResolvedRef = useRef(null)
  const submittedMineRef = useRef(false)

  useEffect(() => {
    fieldsRef.current = fields
  }, [fields])
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
    const letter = pickLetter(recentRef.current)
    recentRef.current = [letter, ...recentRef.current].slice(0, RECENT_MEMORY)
    const roundId = crypto.randomUUID()
    channelRef.current?.send({
      type: 'broadcast',
      event: 'atobis-round-start',
      payload: { roundIndex: index, roundId, letter },
    })
  }, [])

  const startReview = useCallback((roundId, roundIndex, letter) => {
    if (resolvedRef.current === roundId) return
    resolvedRef.current = roundId
    if (graceTimerRef.current) clearTimeout(graceTimerRef.current)
    if (finalTimerRef.current) clearTimeout(finalTimerRef.current)

    channelRef.current?.send({
      type: 'broadcast',
      event: 'atobis-review-start',
      payload: { roundId, roundIndex, letter, submissions: submissionsRef.current },
    })
  }, [])

  const confirmScores = useCallback(() => {
    const rd = roundDataRef.current
    if (!rd || reviewResolvedRef.current === rd.roundId) return
    reviewResolvedRef.current = rd.roundId
    if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current)

    const subs = submissionsRef.current
    const ov = overridesRef.current
    const pointsByField = {}
    const totalPoints = {}
    for (const f of FIELDS) {
      const words = {}
      for (const [pid, entry] of Object.entries(subs)) {
        words[pid] = entry.fields[f.key] || ''
      }
      const pts = scoreFieldWithOverrides(words, rd.letter, ov[f.key] || {})
      pointsByField[f.key] = pts
      for (const [pid, p] of Object.entries(pts)) {
        totalPoints[pid] = (totalPoints[pid] || 0) + p
      }
    }
    const newScores = { ...scoresRef.current }
    for (const [pid, p] of Object.entries(totalPoints)) {
      newScores[pid] = (newScores[pid] || 0) + p
    }

    channelRef.current?.send({
      type: 'broadcast',
      event: 'atobis-round-result',
      payload: { roundId: rd.roundId, roundIndex: rd.roundIndex, letter: rd.letter, submissions: subs, pointsByField, totalPoints, scores: newScores },
    })
  }, [])

  useEffect(() => {
    if (!channel) return
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'atobis-round-start' }, ({ payload }) => {
        submissionsRef.current = {}
        overridesRef.current = {}
        submittedMineRef.current = false
        resolvedRef.current = null
        reviewResolvedRef.current = null
        setFields(EMPTY_FIELDS)
        setStoppedByName(null)
        setReviewSubmissions(null)
        setOverrides({})
        setLastResult(null)
        setRoundData(payload)
        setPhase('answering')
      })
      .on('broadcast', { event: 'atobis-stop' }, ({ payload }) => {
        setStoppedByName(payload.byName)
        setPhase('stopped')
        if (!submittedMineRef.current) {
          submittedMineRef.current = true
          channel.send({
            type: 'broadcast',
            event: 'atobis-submit',
            payload: {
              roundId: payload.roundId,
              playerId: profile.id,
              playerName: profile.display_name,
              fields: fieldsRef.current,
            },
          })
        }
        if (isHost) {
          if (graceTimerRef.current) clearTimeout(graceTimerRef.current)
          graceTimerRef.current = setTimeout(() => {
            const rd = roundDataRef.current
            startReview(payload.roundId, rd.roundIndex, rd.letter)
          }, GRACE_MS)
          if (finalTimerRef.current) clearTimeout(finalTimerRef.current)
          finalTimerRef.current = setTimeout(() => {
            const rd = roundDataRef.current
            startReview(payload.roundId, rd.roundIndex, rd.letter)
          }, FINAL_TIMEOUT_MS)
        }
      })
      .on('broadcast', { event: 'atobis-submit' }, ({ payload }) => {
        submissionsRef.current = {
          ...submissionsRef.current,
          [payload.playerId]: { name: payload.playerName, fields: payload.fields },
        }
        if (isHost && roundDataRef.current?.roundId === payload.roundId) {
          const total = Object.keys(playersRef.current).length
          if (Object.keys(submissionsRef.current).length >= total) {
            const rd = roundDataRef.current
            startReview(payload.roundId, rd.roundIndex, rd.letter)
          }
        }
      })
      .on('broadcast', { event: 'atobis-review-start' }, ({ payload }) => {
        submissionsRef.current = payload.submissions
        overridesRef.current = {}
        reviewResolvedRef.current = null
        setReviewSubmissions(payload.submissions)
        setOverrides({})
        setPhase('review')
        if (isHost) {
          if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current)
          reviewTimerRef.current = setTimeout(() => confirmScores(), REVIEW_TIMEOUT_MS)
        }
      })
      .on('broadcast', { event: 'atobis-toggle-valid' }, ({ payload }) => {
        overridesRef.current = {
          ...overridesRef.current,
          [payload.field]: { ...(overridesRef.current[payload.field] || {}), [payload.playerId]: payload.valid },
        }
        setOverrides(overridesRef.current)
      })
      .on('broadcast', { event: 'atobis-round-result' }, ({ payload }) => {
        setLastResult(payload)
        setScores(payload.scores)
        setPhase('result')
      })

    if (isHost) {
      setTimeout(() => startRound(1), 400)
    }

    return () => {
      if (graceTimerRef.current) clearTimeout(graceTimerRef.current)
      if (finalTimerRef.current) clearTimeout(finalTimerRef.current)
      if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current)
      channel
        .off('broadcast', { event: 'atobis-round-start' })
        .off('broadcast', { event: 'atobis-stop' })
        .off('broadcast', { event: 'atobis-submit' })
        .off('broadcast', { event: 'atobis-review-start' })
        .off('broadcast', { event: 'atobis-toggle-valid' })
        .off('broadcast', { event: 'atobis-round-result' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel])

  function updateField(key, value) {
    setFields((f) => ({ ...f, [key]: value }))
  }

  function pressStop() {
    if (!roundData || phase !== 'answering') return
    channelRef.current?.send({
      type: 'broadcast',
      event: 'atobis-stop',
      payload: { roundId: roundData.roundId, byPlayerId: profile.id, byName: profile.display_name },
    })
  }

  function toggleValid(field, playerId, currentValid) {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'atobis-toggle-valid',
      payload: { roundId: roundData.roundId, field, playerId, valid: !currentValid },
    })
  }

  function advanceRound() {
    if (!isHost || !lastResult) return
    if (lastResult.roundIndex >= config.rounds) {
      finishGame(lastResult.scores)
    } else {
      startRound(lastResult.roundIndex + 1)
    }
  }

  const filledCount = FIELDS.filter((f) => fields[f.key].trim()).length

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
          <p className="text-xs text-ink-muted font-bold">أتوبيس</p>
          <p className="text-sm font-black">
            الجولة <span className="text-primary">{roundData?.roundIndex || 1}</span> / {config.rounds}
          </p>
        </div>
        <div className="w-9" />
      </div>

      <div className="flex-1 flex flex-col items-center px-6 gap-4 overflow-y-auto py-5">
        <AnimatePresence mode="wait">
          {(phase === 'answering' || phase === 'stopped') && roundData && (
            <motion.div
              key="answering"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-4 w-full max-w-xs"
            >
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm text-ink-muted font-bold">الحرف</p>
                <div className="text-5xl font-black text-primary">{roundData.letter}</div>
              </div>

              <div className="w-full flex flex-col gap-2">
                {FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-xs font-bold text-ink-muted text-end">{f.label}</span>
                    <input
                      dir="rtl"
                      disabled={phase === 'stopped'}
                      value={fields[f.key]}
                      onChange={(e) => updateField(f.key, e.target.value)}
                      placeholder={f.label}
                      className="flex-1 text-center font-bold bg-surface border-2 border-line focus:border-primary rounded-btn px-4 py-2.5 outline-none transition-colors disabled:opacity-50"
                    />
                  </div>
                ))}
              </div>

              {phase === 'answering' ? (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={pressStop}
                  className="w-full bg-danger text-white font-black text-lg rounded-btn py-3.5"
                >
                  🛑 توقف ({filledCount}/6)
                </motion.button>
              ) : (
                <p className="text-ink-muted font-bold text-center">
                  {stoppedByName} ضغط توقف! بانتظار البقية...
                </p>
              )}
            </motion.div>
          )}

          {phase === 'review' && reviewSubmissions && roundData && (
            <motion.div
              key="review"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col gap-3 w-full max-w-md"
            >
              <p className="text-center font-black text-lg">
                راجعوا الإجابات — الحرف: <span className="text-primary">{roundData.letter}</span>
              </p>
              <p className="text-xs text-ink-muted text-center">اضغطوا على أي إجابة غلط عشان تلغونها قبل الاحتساب</p>
              <div className="w-full overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-start p-1.5 text-ink-muted font-bold">اللاعب</th>
                      {FIELDS.map((f) => (
                        <th key={f.key} className="p-1.5 text-ink-muted font-bold whitespace-nowrap">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(reviewSubmissions).map(([pid, sub]) => (
                      <tr key={pid} className="border-t border-line">
                        <td className="p-1.5 font-bold whitespace-nowrap">{sub.name}</td>
                        {FIELDS.map((f) => {
                          const word = sub.fields[f.key] || ''
                          const baseValid = startsWithLetter(word, roundData.letter)
                          const fieldOverrides = overrides[f.key] || {}
                          const valid = fieldOverrides[pid] !== undefined ? fieldOverrides[pid] : baseValid
                          return (
                            <td key={f.key} className="p-1.5 text-center">
                              <button
                                onClick={() => word.trim() && toggleValid(f.key, pid, valid)}
                                disabled={!word.trim()}
                                className={`w-full flex flex-col items-center gap-0.5 rounded-btn px-1.5 py-1.5 border-2 transition-colors ${
                                  !word.trim()
                                    ? 'border-line bg-surface-2 opacity-50'
                                    : valid
                                      ? 'border-success bg-success-soft'
                                      : 'border-danger bg-danger-soft'
                                }`}
                              >
                                <span className="truncate max-w-[4.5rem]">{word || '—'}</span>
                                {word.trim() &&
                                  (valid ? (
                                    <Check size={12} className="text-success" />
                                  ) : (
                                    <XCircle size={12} className="text-danger" />
                                  ))}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {isHost && (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={confirmScores}
                  className="w-full bg-primary text-primary-ink font-black text-lg rounded-btn py-3.5"
                >
                  ✅ احسب النقاط
                </motion.button>
              )}
              {!isHost && <p className="text-xs text-ink-muted text-center">المضيف يحسب النقاط بعد المراجعة</p>}
            </motion.div>
          )}

          {phase === 'result' && lastResult && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col gap-3 w-full max-w-md"
            >
              <p className="text-center font-black text-lg">
                الحرف كان: <span className="text-primary">{lastResult.letter}</span>
              </p>
              <div className="w-full overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-start p-1.5 text-ink-muted font-bold">اللاعب</th>
                      {FIELDS.map((f) => (
                        <th key={f.key} className="p-1.5 text-ink-muted font-bold whitespace-nowrap">
                          {f.label}
                        </th>
                      ))}
                      <th className="p-1.5 text-ink-muted font-bold">المجموع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(lastResult.submissions).map(([pid, sub]) => (
                      <tr key={pid} className="border-t border-line">
                        <td className="p-1.5 font-bold whitespace-nowrap">{sub.name}</td>
                        {FIELDS.map((f) => {
                          const word = sub.fields[f.key] || '—'
                          const pts = lastResult.pointsByField[f.key]?.[pid] || 0
                          return (
                            <td key={f.key} className="p-1.5 text-center">
                              <div className="flex flex-col items-center">
                                <span>{word}</span>
                                <span
                                  className={`text-[0.65rem] font-bold ${
                                    pts === 2 ? 'text-success' : pts === 1 ? 'text-warning' : 'text-danger'
                                  }`}
                                >
                                  +{pts}
                                </span>
                              </div>
                            </td>
                          )
                        })}
                        <td className="p-1.5 text-center font-black text-primary">
                          {lastResult.totalPoints[pid] || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {isHost ? (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={advanceRound}
                  className="w-full bg-primary text-primary-ink font-black text-lg rounded-btn py-3.5"
                >
                  {lastResult.roundIndex >= config.rounds ? '🏁 اعرض النتيجة النهائية' : '▶️ الجولة الجاية'}
                </motion.button>
              ) : (
                <p className="text-xs text-ink-muted text-center">بانتظار المضيف ينقلنا للجولة الجاية...</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
