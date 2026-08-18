import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Eraser } from 'lucide-react'
import { pickWord, checkGuess } from './logic'

const ANSWER_TIMEOUT_MS = 75000
const RESULT_PAUSE_MS = 4500
const RECENT_MEMORY = 10
const CANVAS_W = 600
const CANVAS_H = 420
const COLORS = ['#1a1a1a', '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ffffff']
const SIZES = [4, 9, 16]

export default function DrawGuessGameScreen({ code, profile, players, isHost, config, onExit, finishGame, channel }) {
  const [phase, setPhase] = useState('drawing') // drawing | result
  const [roundData, setRoundData] = useState(null)
  const [guesses, setGuesses] = useState([])
  const [myGuess, setMyGuess] = useState('')
  const [lastResult, setLastResult] = useState(null)
  const [scores, setScores] = useState({})
  const [color, setColor] = useState(COLORS[0])
  const [brushSize, setBrushSize] = useState(SIZES[1])

  const channelRef = useRef(null)
  const scoresRef = useRef({})
  const playersRef = useRef(players)
  const roundDataRef = useRef(null)
  const recentRef = useRef([])
  const orderRef = useRef(null)
  const answerTimerRef = useRef(null)
  const resolvedRef = useRef(null)
  const canvasRef = useRef(null)
  const isDrawingRef = useRef(false)
  const lastSendRef = useRef(0)

  useEffect(() => {
    scoresRef.current = scores
  }, [scores])
  useEffect(() => {
    playersRef.current = players
  }, [players])
  useEffect(() => {
    roundDataRef.current = roundData
  }, [roundData])

  const isDrawer = roundData?.drawerId === profile.id

  function clearCanvas() {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  }

  function drawSegment(fromNorm, toNorm, strokeColor, size) {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(fromNorm.x * CANVAS_W, fromNorm.y * CANVAS_H)
    ctx.lineTo(toNorm.x * CANVAS_W, toNorm.y * CANVAS_H)
    ctx.stroke()
  }

  const startRound = useCallback((index) => {
    if (!orderRef.current) {
      orderRef.current = Object.keys(playersRef.current).sort(() => Math.random() - 0.5)
    }
    const order = orderRef.current
    const drawerId = order[(index - 1) % order.length]
    const drawerName = playersRef.current[drawerId]?.name || '؟'
    const { idx, word } = pickWord(recentRef.current)
    recentRef.current = [idx, ...recentRef.current].slice(0, RECENT_MEMORY)
    const roundId = crypto.randomUUID()
    channelRef.current?.send({
      type: 'broadcast',
      event: 'drawguess-round-start',
      payload: { roundIndex: index, roundId, drawerId, drawerName, word },
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
      if (rd?.drawerId) newScores[rd.drawerId] = (newScores[rd.drawerId] || 0) + 50
    }

    channelRef.current?.send({
      type: 'broadcast',
      event: 'drawguess-round-result',
      payload: { roundId, roundIndex, winnerId, winnerName, word, scores: newScores },
    })
  }, [])

  useEffect(() => {
    if (!channel) return
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'drawguess-round-start' }, ({ payload }) => {
        resolvedRef.current = null
        setGuesses([])
        setMyGuess('')
        setLastResult(null)
        setRoundData(payload)
        setPhase('drawing')
        clearCanvas()

        if (isHost) {
          if (answerTimerRef.current) clearTimeout(answerTimerRef.current)
          answerTimerRef.current = setTimeout(() => {
            finishRound(payload.roundId, payload.roundIndex, null, null, payload.word)
          }, ANSWER_TIMEOUT_MS)
        }
      })
      .on('broadcast', { event: 'drawguess-stroke' }, ({ payload }) => {
        if (payload.by === profile.id) return
        drawSegment(payload.from, payload.to, payload.color, payload.size)
      })
      .on('broadcast', { event: 'drawguess-clear' }, () => {
        clearCanvas()
      })
      .on('broadcast', { event: 'drawguess-guess' }, ({ payload }) => {
        setGuesses((g) => [...g, payload])
        if (isHost && roundDataRef.current?.roundId === payload.roundId) {
          const rd = roundDataRef.current
          if (payload.playerId !== rd.drawerId && checkGuess(payload.text, rd.word)) {
            finishRound(payload.roundId, rd.roundIndex, payload.playerId, payload.playerName, rd.word)
          }
        }
      })
      .on('broadcast', { event: 'drawguess-round-result' }, ({ payload }) => {
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
        .off('broadcast', { event: 'drawguess-round-start' })
        .off('broadcast', { event: 'drawguess-stroke' })
        .off('broadcast', { event: 'drawguess-clear' })
        .off('broadcast', { event: 'drawguess-guess' })
        .off('broadcast', { event: 'drawguess-round-result' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel])

  useEffect(() => {
    clearCanvas()
  }, [])

  function getNormalizedPoint(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
  }

  const lastPointRef = useRef(null)

  function onPointerDown(e) {
    if (!isDrawer || phase !== 'drawing') return
    e.target.setPointerCapture?.(e.pointerId)
    isDrawingRef.current = true
    lastPointRef.current = getNormalizedPoint(e)
  }

  function onPointerMove(e) {
    if (!isDrawingRef.current || !isDrawer) return
    const now = Date.now()
    if (now - lastSendRef.current < 16) return
    lastSendRef.current = now
    const pt = getNormalizedPoint(e)
    const from = lastPointRef.current || pt
    drawSegment(from, pt, color, brushSize)
    channelRef.current?.send({
      type: 'broadcast',
      event: 'drawguess-stroke',
      payload: { by: profile.id, from, to: pt, color, size: brushSize },
    })
    lastPointRef.current = pt
  }

  function onPointerUp() {
    isDrawingRef.current = false
    lastPointRef.current = null
  }

  function handleClear() {
    if (!isDrawer) return
    clearCanvas()
    channelRef.current?.send({ type: 'broadcast', event: 'drawguess-clear', payload: {} })
  }

  function submitGuess(e) {
    e.preventDefault()
    if (!myGuess.trim() || !roundData || isDrawer) return
    channelRef.current?.send({
      type: 'broadcast',
      event: 'drawguess-guess',
      payload: { roundId: roundData.roundId, playerId: profile.id, playerName: profile.display_name, text: myGuess.trim() },
    })
    setMyGuess('')
  }

  const wordBlanks = roundData ? '⬜'.repeat(roundData.word.length) : ''

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
          <p className="text-xs text-ink-muted font-bold">وش رسمت؟</p>
          <p className="text-sm font-black">
            الجولة <span className="text-primary">{roundData?.roundIndex || 1}</span> / {config.rounds}
          </p>
        </div>
        <div className="w-9" />
      </div>

      <div className="flex-1 flex flex-col items-center px-4 gap-3 overflow-y-auto py-4">
        <AnimatePresence mode="wait">
          {phase === 'drawing' && roundData && (
            <motion.div
              key="drawing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-3 w-full max-w-md"
            >
              <p className="text-sm font-black text-center">
                {isDrawer ? (
                  <>
                    ارسم: <span className="text-primary">{roundData.word}</span>
                  </>
                ) : (
                  <>
                    {roundData.drawerName} يرسم الحين — خمن الكلمة
                    <span className="block text-xs text-ink-muted mt-1 tracking-widest">{wordBlanks}</span>
                  </>
                )}
              </p>

              <div className="w-full rounded-card overflow-hidden shadow-pop border-2 border-line bg-white">
                <canvas
                  ref={canvasRef}
                  width={CANVAS_W}
                  height={CANVAS_H}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerUp}
                  style={{ width: '100%', height: 'auto', touchAction: 'none', cursor: isDrawer ? 'crosshair' : 'default' }}
                />
              </div>

              {isDrawer && (
                <div className="w-full flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        aria-label={c}
                        className={`w-6 h-6 rounded-full border-2 transition-transform ${
                          color === c ? 'scale-110 border-primary' : 'border-line'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {SIZES.map((s) => (
                      <button
                        key={s}
                        onClick={() => setBrushSize(s)}
                        className={`w-7 h-7 rounded-full flex items-center justify-center border-2 ${
                          brushSize === s ? 'border-primary bg-primary-soft' : 'border-line bg-surface'
                        }`}
                      >
                        <span className="rounded-full bg-ink" style={{ width: s * 0.6, height: s * 0.6 }} />
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleClear}
                    className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center text-ink-muted"
                    aria-label="مسح"
                  >
                    <Eraser size={16} />
                  </button>
                </div>
              )}

              <div className="w-full flex flex-col gap-1.5 max-h-28 overflow-y-auto bg-surface-2 rounded-btn p-2.5">
                {guesses.length === 0 && <p className="text-xs text-ink-muted text-center">التخمينات بتطلع هنا...</p>}
                {guesses.map((g, i) => (
                  <p key={i} className="text-xs font-bold">
                    <span className="text-ink-muted">{g.playerName}:</span> {g.text}
                  </p>
                ))}
              </div>

              {!isDrawer && (
                <form onSubmit={submitGuess} className="w-full flex gap-2">
                  <input
                    autoFocus
                    value={myGuess}
                    onChange={(e) => setMyGuess(e.target.value)}
                    placeholder="اكتب تخمينك..."
                    className="flex-1 text-center font-bold bg-surface border-2 border-line focus:border-primary rounded-btn px-4 py-2.5 outline-none transition-colors"
                  />
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    type="submit"
                    disabled={!myGuess.trim()}
                    className="bg-primary text-primary-ink font-black rounded-btn px-5 disabled:opacity-40"
                  >
                    أرسل
                  </motion.button>
                </form>
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
              <span className="text-6xl">🎨</span>
              <p className="text-xl font-black text-primary">الكلمة كانت: {lastResult.word}</p>
              {lastResult.winnerId ? (
                <p className="font-bold text-lg text-success">
                  {lastResult.winnerName} خمنها صح! 🎉 <span className="text-primary">+100</span>
                </p>
              ) : (
                <p className="font-bold text-lg text-danger">محد خمنها ⏱️</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
