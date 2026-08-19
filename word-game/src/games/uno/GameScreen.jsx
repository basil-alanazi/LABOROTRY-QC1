import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, RotateCcw, ArrowRight } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'
import { playUnoChime, playLaughChime, playStrongLaughChime } from '../../lib/sound'
import {
  COLORS,
  COLOR_META,
  isWild,
  colorOf,
  kindOf,
  dealInitialState,
  playCard,
  drawCardForPlayer,
  callUno,
  catchUno,
  computeFinalScores,
} from './logic'

const TURN_TIMEOUT_MS = 45000
const WIN_PAUSE_MS = 5000

const CARD_DIMS = { lg: 'w-20 h-28', md: 'w-14 h-20', sm: 'w-11 h-16' }
const CARD_PAD = { lg: '3.5px', md: '3px', sm: '2.5px' }
const CARD_CORNER_TEXT = { lg: 'text-sm', md: 'text-[0.68rem]', sm: 'text-[0.6rem]' }
const CARD_VAL_TEXT = { lg: 'text-4xl', md: 'text-2xl', sm: 'text-lg' }

function CardFace({ cardId, size = 'md', dim = false }) {
  const dims = CARD_DIMS[size]
  if (!cardId) {
    return <div className={`${dims} rounded-xl border-2 border-dashed border-line shrink-0`} />
  }
  const wild = isWild(cardId)
  const label = wild ? (cardId === 'wild4' ? '+4' : '★') : (() => {
    const k = kindOf(cardId)
    return k === 'skip' ? '🚫' : k === 'reverse' ? '🔁' : k === 'draw2' ? '+2' : k
  })()
  const bg = wild ? 'conic-gradient(#ef4444,#eab308,#22c55e,#3b82f6,#ef4444)' : COLOR_META[colorOf(cardId)].bg
  const ovalTextColor = wild ? '#1a1a1a' : COLOR_META[colorOf(cardId)].bg
  const cornerCls = CARD_CORNER_TEXT[size]
  const valCls = CARD_VAL_TEXT[size]

  return (
    <div
      className={`${dims} rounded-xl shadow-pop shrink-0 ${dim ? 'opacity-40' : ''}`}
      style={{ background: '#0d0d10', padding: CARD_PAD[size] }}
    >
      <div
        className="relative w-full h-full rounded-[0.6rem] border-[2.5px] border-white overflow-hidden"
        style={{ background: bg }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="bg-white flex items-center justify-center"
            style={{ width: '78%', height: '138%', borderRadius: '50%', transform: 'rotate(-22deg)' }}
          >
            <span className={`font-black ${valCls}`} style={{ color: ovalTextColor, transform: 'rotate(22deg)' }}>
              {label}
            </span>
          </div>
        </div>
        <span className={`absolute top-1 right-1.5 font-black text-white leading-none drop-shadow ${cornerCls}`}>
          {label}
        </span>
        <span
          className={`absolute bottom-1 left-1.5 font-black text-white leading-none drop-shadow ${cornerCls}`}
          style={{ transform: 'rotate(180deg)' }}
        >
          {label}
        </span>
      </div>
    </div>
  )
}

function CardBack({ size = 'sm' }) {
  const sizeClass = size === 'lg' ? 'w-20 h-28' : size === 'sm' ? 'w-8 h-11' : 'w-11 h-16'
  return (
    <div className={`${sizeClass} rounded-lg bg-ink flex items-center justify-center shrink-0 border-2 border-white/20`}>
      <span className="text-white text-[0.55em] font-black">UNO</span>
    </div>
  )
}

export default function UnoGameScreen({ code, profile, players, isHost, onExit, finishGame, channel }) {
  const [state, setState] = useState(null)
  const [pendingWild, setPendingWild] = useState(null)
  const [ended, setEnded] = useState(false)
  const [yaHataf, setYaHataf] = useState(false)

  const channelRef = useRef(null)
  const stateRef = useRef(null)
  const playersRef = useRef(players)
  const turnTimerRef = useRef(null)
  const resolvedTurnRef = useRef(null)
  const finishedRef = useRef(false)
  const lastActionSeenRef = useRef(null)

  useEffect(() => {
    playersRef.current = players
  }, [players])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const broadcastState = useCallback((next) => {
    channelRef.current?.send({ type: 'broadcast', event: 'uno-state', payload: next })
  }, [])

  const armTurnTimer = useCallback(
    (s) => {
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current)
      if (s.winnerId) return
      turnTimerRef.current = setTimeout(() => {
        if (resolvedTurnRef.current === s.turnId) return
        resolvedTurnRef.current = s.turnId
        const currentPlayer = s.turnOrder[s.turnIndex]
        const next = drawCardForPlayer(s, currentPlayer)
        broadcastState(next)
      }, TURN_TIMEOUT_MS)
    },
    [broadcastState]
  )

  useEffect(() => {
    if (!channel) return
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'uno-state' }, ({ payload }) => {
        resolvedTurnRef.current = null
        setState(payload)
        if (isHost) armTurnTimer(payload)
      })
      .on('broadcast', { event: 'uno-action' }, ({ payload }) => {
        if (!isHost) return
        const s = stateRef.current
        if (!s) return
        let next = s
        if (payload.type === 'play') {
          next = playCard(s, payload.playerId, payload.cardId, payload.chosenColor, payload.saidUno)
        } else if (payload.type === 'draw') {
          next = drawCardForPlayer(s, payload.playerId)
        } else if (payload.type === 'call-uno') {
          next = callUno(s, payload.playerId)
        } else if (payload.type === 'catch-uno') {
          next = catchUno(s, payload.targetId, payload.byId)
        }
        if (next !== s) broadcastState(next)
      })

    if (isHost) {
      const initial = dealInitialState(Object.keys(playersRef.current))
      broadcastState(initial)
    }

    return () => {
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current)
      channel.off('broadcast', { event: 'uno-state' }).off('broadcast', { event: 'uno-action' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel])

  useEffect(() => {
    if (!state?.winnerId || finishedRef.current) return
    finishedRef.current = true
    setEnded(true)
    if (isHost) {
      const scores = computeFinalScores(state)
      setTimeout(() => finishGame(scores), WIN_PAUSE_MS)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.winnerId])

  useEffect(() => {
    const a = state?.lastAction
    if (!a || a === lastActionSeenRef.current) return
    lastActionSeenRef.current = a
    if (a.type === 'call-uno') {
      playUnoChime()
    } else if (a.type === 'uno-penalty') {
      playLaughChime()
    } else if (a.type === 'play') {
      const kind = kindOf(a.card)
      if (kind === 'draw2') {
        playLaughChime()
      } else if (kind === 'wild4') {
        playStrongLaughChime()
        setYaHataf(true)
        setTimeout(() => setYaHataf(false), 1600)
      }
    }
  }, [state?.lastAction])

  function sendAction(payload) {
    channelRef.current?.send({ type: 'broadcast', event: 'uno-action', payload })
  }

  function handleCardTap(cardId) {
    if (!state || state.winnerId) return
    if (state.turnOrder[state.turnIndex] !== profile.id) return
    if (isWild(cardId)) {
      setPendingWild(cardId)
      return
    }
    sendAction({ type: 'play', playerId: profile.id, cardId })
  }

  function chooseColor(c) {
    if (!pendingWild) return
    sendAction({ type: 'play', playerId: profile.id, cardId: pendingWild, chosenColor: c })
    setPendingWild(null)
  }

  function handleDraw() {
    if (!state || state.winnerId) return
    if (state.turnOrder[state.turnIndex] !== profile.id) return
    sendAction({ type: 'draw', playerId: profile.id })
  }

  function handleCallUno() {
    sendAction({ type: 'call-uno', playerId: profile.id })
  }

  function handleCatchUno(targetId) {
    sendAction({ type: 'catch-uno', targetId, byId: profile.id })
  }

  if (!state) {
    return (
      <div className="fixed inset-0 z-50 bg-canvas flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-primary-soft border-t-primary animate-spin" />
      </div>
    )
  }

  const myHand = state.hands[profile.id] || []
  const myTurn = state.turnOrder[state.turnIndex] === profile.id
  const top = state.discard[state.discard.length - 1]
  const others = state.turnOrder.filter((id) => id !== profile.id)
  const isPlayable = (cardId) =>
    myTurn &&
    (isWild(cardId) ||
      colorOf(cardId) === state.currentColor ||
      kindOf(cardId) === kindOf(top) ||
      (!isWild(top) && colorOf(cardId) === colorOf(top)))

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
        <div className="text-center flex items-center gap-2">
          <p className="text-sm font-black">UNO</p>
          {state.direction === 1 ? (
            <ArrowRight size={16} className="text-ink-muted" />
          ) : (
            <RotateCcw size={16} className="text-ink-muted" />
          )}
        </div>
        <div className="w-9" />
      </div>

      <div className="flex-1 flex flex-col mx-3 mt-2 rounded-[2.5rem] bg-gradient-to-b from-success-soft to-success-soft/40 border-4 border-success/25 overflow-hidden">
        <div className="flex items-start justify-center gap-3 px-4 pt-4 flex-wrap">
          {others.map((id, idx) => {
            const p = players[id]
            const count = state.hands[id]?.length || 0
            const isTurn = state.turnOrder[state.turnIndex] === id
            const catchable = state.unoPending?.playerId === id
            const n = others.length
            const t = n > 1 ? idx / (n - 1) : 0.5
            const lift = Math.sin(t * Math.PI) * 16
            return (
              <div
                key={id}
                style={{ transform: `translateY(${-lift}px)` }}
                className={`flex flex-col items-center gap-1 rounded-card px-2.5 py-2 border-2 transition-colors bg-surface/90 backdrop-blur-sm ${
                  catchable ? 'border-danger bg-danger-soft' : isTurn ? 'border-primary bg-primary-soft' : 'border-line'
                }`}
              >
                <Avatar name={p?.name} src={p?.avatarUrl} size="sm" />
                <span className="text-[0.65rem] font-bold truncate max-w-[4.5rem]">{p?.name}</span>
                <div className="flex items-center gap-1">
                  <CardBack size="sm" />
                  <span className="text-xs font-black">{count}</span>
                </div>
                {catchable ? (
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => handleCatchUno(id)}
                    className="text-[0.6rem] font-black text-white bg-danger rounded-pill px-2 py-0.5 mt-0.5"
                  >
                    امسك! ⚠️
                  </motion.button>
                ) : (
                  count === 1 && <span className="text-[0.6rem] font-black text-danger">UNO!</span>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="flex items-center gap-6">
            <button onClick={handleDraw} disabled={!myTurn} className="flex flex-col items-center gap-1 disabled:opacity-50">
              <CardBack size="lg" />
              <span className="text-xs font-bold text-ink-muted">اسحب</span>
            </button>
            <CardFace cardId={top} size="lg" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted font-bold">اللون الحالي:</span>
            <span className="w-5 h-5 rounded-full border-2 border-white shadow" style={{ background: COLOR_META[state.currentColor]?.bg }} />
          </div>
          <p className="text-sm font-black text-center">
            {state.winnerId ? '' : myTurn ? 'دورك الحين! 🎯' : `دور ${players[state.turnOrder[state.turnIndex]]?.name || '؟'}...`}
          </p>

          {state.unoPending?.playerId === profile.id && (
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={handleCallUno}
              className="bg-danger text-white font-black rounded-pill px-6 py-2.5 shadow-pop"
            >
              قلت أونو! 🗣️
            </motion.button>
          )}
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="flex gap-2 overflow-x-auto pb-2 px-1">
          {myHand.map((cardId, i) => (
            <motion.button
              key={`${cardId}-${i}`}
              whileTap={{ scale: 0.92 }}
              onClick={() => handleCardTap(cardId)}
              disabled={!isPlayable(cardId)}
              className="shrink-0"
              style={{ marginTop: isPlayable(cardId) ? -8 : 0 }}
            >
              <CardFace cardId={cardId} size="md" dim={!isPlayable(cardId)} />
            </motion.button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {pendingWild && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-10 bg-black/50 flex items-center justify-center px-8"
            onClick={() => setPendingWild(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface rounded-card p-6 flex flex-col items-center gap-4 w-full max-w-xs"
            >
              <p className="font-black">اختر لون</p>
              <div className="grid grid-cols-2 gap-3 w-full">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => chooseColor(c)}
                    className="h-14 rounded-btn font-black text-white"
                    style={{ background: COLOR_META[c].bg }}
                  >
                    {COLOR_META[c].label}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {yaHataf && (
          <motion.div
            initial={{ opacity: 0, scale: 0.7, rotate: -6 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-30 flex items-center justify-center pointer-events-none"
          >
            <span className="text-6xl font-black text-white drop-shadow-lg" style={{ WebkitTextStroke: '2px #000' }}>
              يا هطف! 😂
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {ended && state.winnerId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-20 bg-black/60 flex items-center justify-center px-8"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-surface rounded-card p-8 flex flex-col items-center gap-3 text-center"
            >
              <span className="text-6xl">🏆</span>
              <p className="text-xl font-black text-primary">
                {players[state.winnerId]?.name || '؟'} فاز باللعبة!
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
