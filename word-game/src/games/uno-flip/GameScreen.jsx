import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, RotateCcw, ArrowRight } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'
import {
  isWild,
  colorOf,
  kindOf,
  paletteFor,
  metaFor,
  dealInitialState,
  playCard,
  drawCardForPlayer,
  computeFinalScores,
} from './logic'

const TURN_TIMEOUT_MS = 45000
const WIN_PAUSE_MS = 5000

const CARD_DIMS = { lg: 'w-20 h-28', md: 'w-14 h-20', sm: 'w-11 h-16' }
const CARD_PAD = { lg: '3.5px', md: '3px', sm: '2.5px' }
const CARD_CORNER_TEXT = { lg: 'text-sm', md: 'text-[0.68rem]', sm: 'text-[0.6rem]' }
const CARD_VAL_TEXT = { lg: 'text-4xl', md: 'text-2xl', sm: 'text-lg' }

function CardFace({ cardId, side, size = 'md', dim = false }) {
  const dims = CARD_DIMS[size]
  if (!cardId) {
    return <div className={`${dims} rounded-xl border-2 border-dashed border-line shrink-0`} />
  }
  const wild = isWild(cardId)
  const meta = metaFor(side)
  const label = wild
    ? cardId === 'wilddraw'
      ? side === 'dark'
        ? '+5'
        : '+4'
      : '★'
    : (() => {
        const k = kindOf(cardId)
        const drawLabel = side === 'dark' ? '+3' : '+2'
        return k === 'skip' ? '🚫' : k === 'reverse' ? '🔁' : k === 'draw' ? drawLabel : k === 'flip' ? '🔃' : k
      })()
  const bg = wild
    ? side === 'dark'
      ? 'conic-gradient(#ec4899,#14b8a6,#f97316,#a855f7,#ec4899)'
      : 'conic-gradient(#ef4444,#eab308,#22c55e,#3b82f6,#ef4444)'
    : meta[colorOf(cardId, side)].bg
  const ovalTextColor = wild ? '#1a1a1a' : meta[colorOf(cardId, side)].bg
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

function CardBack({ size = 'sm', side }) {
  const sizeClass = size === 'lg' ? 'w-20 h-28' : size === 'sm' ? 'w-8 h-11' : 'w-11 h-16'
  return (
    <div
      className={`${sizeClass} rounded-lg flex items-center justify-center shrink-0 border-2 border-white/20`}
      style={{ background: side === 'dark' ? '#111827' : '#1a1a1a' }}
    >
      <span className="text-white text-[0.5em] font-black">FLIP</span>
    </div>
  )
}

export default function UnoFlipGameScreen({ code, profile, players, isHost, onExit, finishGame, channel }) {
  const [state, setState] = useState(null)
  const [pendingWild, setPendingWild] = useState(null)
  const [ended, setEnded] = useState(false)

  const channelRef = useRef(null)
  const stateRef = useRef(null)
  const playersRef = useRef(players)
  const turnTimerRef = useRef(null)
  const resolvedTurnRef = useRef(null)
  const finishedRef = useRef(false)

  useEffect(() => {
    playersRef.current = players
  }, [players])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const broadcastState = useCallback((next) => {
    channelRef.current?.send({ type: 'broadcast', event: 'unoflip-state', payload: next })
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
      .on('broadcast', { event: 'unoflip-state' }, ({ payload }) => {
        resolvedTurnRef.current = null
        setState(payload)
        if (isHost) armTurnTimer(payload)
      })
      .on('broadcast', { event: 'unoflip-action' }, ({ payload }) => {
        if (!isHost) return
        const s = stateRef.current
        if (!s) return
        let next = s
        if (payload.type === 'play') {
          next = playCard(s, payload.playerId, payload.cardId, payload.chosenColor)
        } else if (payload.type === 'draw') {
          next = drawCardForPlayer(s, payload.playerId)
        }
        if (next !== s) broadcastState(next)
      })

    if (isHost) {
      const initial = dealInitialState(Object.keys(playersRef.current))
      broadcastState(initial)
    }

    return () => {
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current)
      channel.off('broadcast', { event: 'unoflip-state' }).off('broadcast', { event: 'unoflip-action' })
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

  function sendAction(payload) {
    channelRef.current?.send({ type: 'broadcast', event: 'unoflip-action', payload })
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

  if (!state) {
    return (
      <div className="fixed inset-0 z-50 bg-canvas flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-primary-soft border-t-primary animate-spin" />
      </div>
    )
  }

  const side = state.side
  const meta = metaFor(side)
  const palette = paletteFor(side)
  const myHand = state.hands[profile.id] || []
  const myTurn = state.turnOrder[state.turnIndex] === profile.id
  const top = state.discard[state.discard.length - 1]
  const others = state.turnOrder.filter((id) => id !== profile.id)
  const isPlayable = (cardId) =>
    myTurn &&
    (isWild(cardId) ||
      colorOf(cardId, side) === state.currentColor ||
      kindOf(cardId) === kindOf(top) ||
      (colorOf(top, side) !== null && colorOf(cardId, side) === colorOf(top, side)))

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col transition-colors duration-500"
      style={{ background: side === 'dark' ? '#0b0b14' : 'var(--color-canvas)' }}
    >
      <div className="flex items-center justify-between px-5 pt-5">
        <button
          type="button"
          aria-label="خروج"
          onClick={onExit}
          className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center ${
            side === 'dark' ? 'bg-white/10 text-white' : 'bg-surface-2 text-ink-muted'
          }`}
        >
          <X size={18} />
        </button>
        <div className="text-center flex items-center gap-2">
          <p className={`text-sm font-black ${side === 'dark' ? 'text-white' : ''}`}>
            UNO Flip {side === 'dark' ? '🌑' : '☀️'}
          </p>
          {state.direction === 1 ? (
            <ArrowRight size={16} className={side === 'dark' ? 'text-white/60' : 'text-ink-muted'} />
          ) : (
            <RotateCcw size={16} className={side === 'dark' ? 'text-white/60' : 'text-ink-muted'} />
          )}
        </div>
        <div className="w-9" />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 px-4 pt-3">
        {others.map((id) => {
          const p = players[id]
          const count = state.hands[id]?.length || 0
          const isTurn = state.turnOrder[state.turnIndex] === id
          return (
            <div
              key={id}
              className={`flex flex-col items-center gap-1 rounded-card px-2.5 py-2 border-2 transition-colors ${
                isTurn
                  ? 'border-primary bg-primary-soft'
                  : side === 'dark'
                    ? 'border-white/10 bg-white/5'
                    : 'border-line bg-surface'
              }`}
            >
              <Avatar name={p?.name} src={p?.avatarUrl} size="sm" />
              <span className={`text-[0.65rem] font-bold truncate max-w-[4.5rem] ${side === 'dark' ? 'text-white' : ''}`}>
                {p?.name}
              </span>
              <div className="flex items-center gap-1">
                <CardBack size="sm" side={side} />
                <span className={`text-xs font-black ${side === 'dark' ? 'text-white' : ''}`}>{count}</span>
              </div>
              {count === 1 && <span className="text-[0.6rem] font-black text-danger">UNO!</span>}
            </div>
          )
        })}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="flex items-center gap-6">
          <button onClick={handleDraw} disabled={!myTurn} className="flex flex-col items-center gap-1 disabled:opacity-50">
            <CardBack size="lg" side={side} />
            <span className={`text-xs font-bold ${side === 'dark' ? 'text-white/70' : 'text-ink-muted'}`}>اسحب</span>
          </button>
          <CardFace cardId={top} side={side} size="lg" />
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${side === 'dark' ? 'text-white/70' : 'text-ink-muted'}`}>اللون الحالي:</span>
          <span className="w-5 h-5 rounded-full border-2 border-white shadow" style={{ background: meta[state.currentColor]?.bg }} />
        </div>
        <p className={`text-sm font-black text-center ${side === 'dark' ? 'text-white' : ''}`}>
          {state.winnerId ? '' : myTurn ? 'دورك الحين! 🎯' : `دور ${players[state.turnOrder[state.turnIndex]]?.name || '؟'}...`}
        </p>
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
              <CardFace cardId={cardId} side={side} size="md" dim={!isPlayable(cardId)} />
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
                {palette.map((c) => (
                  <button
                    key={c}
                    onClick={() => chooseColor(c)}
                    className="h-14 rounded-btn font-black text-white"
                    style={{ background: meta[c].bg }}
                  >
                    {meta[c].label}
                  </button>
                ))}
              </div>
            </motion.div>
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
