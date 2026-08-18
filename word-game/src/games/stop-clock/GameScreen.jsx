import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'
import { createInitialState, processStop, processBust, computeFinalScores, elapsedNow } from './logic'

const WIN_PAUSE_MS = 5000
const BUST_GRACE_MS = 120

function formatTime(seconds) {
  const clamped = Math.max(0, seconds)
  return clamped.toFixed(2).padStart(5, '0')
}

export default function StopClockGameScreen({ profile, players, isHost, onExit, finishGame, channel }) {
  const [state, setState] = useState(null)
  const [display, setDisplay] = useState(0)
  const [ended, setEnded] = useState(false)

  const channelRef = useRef(null)
  const stateRef = useRef(null)
  const playersRef = useRef(players)
  const bustTimerRef = useRef(null)
  const resolvedTokenRef = useRef(null)
  const finishedRef = useRef(false)
  const rafRef = useRef(null)

  useEffect(() => {
    playersRef.current = players
  }, [players])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const broadcastState = useCallback((next) => {
    channelRef.current?.send({ type: 'broadcast', event: 'stopclock-state', payload: next })
  }, [])

  const armBustTimer = useCallback(
    (s) => {
      if (bustTimerRef.current) clearTimeout(bustTimerRef.current)
      if (s.winnerId) return
      const remainingMs = Math.max(0, (s.target - s.baseValue) * 1000) + BUST_GRACE_MS
      bustTimerRef.current = setTimeout(() => {
        if (resolvedTokenRef.current === s.turnToken) return
        resolvedTokenRef.current = s.turnToken
        const currentPlayer = s.activePlayers[s.turnIndex]
        const next = processBust(s, currentPlayer)
        broadcastState(next)
      }, remainingMs)
    },
    [broadcastState]
  )

  useEffect(() => {
    if (!channel) return
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'stopclock-state' }, ({ payload }) => {
        resolvedTokenRef.current = null
        setState(payload)
        if (isHost) armBustTimer(payload)
      })
      .on('broadcast', { event: 'stopclock-action' }, ({ payload }) => {
        if (!isHost) return
        const s = stateRef.current
        if (!s) return
        const next = processStop(s, payload.playerId)
        if (next !== s) broadcastState(next)
      })

    if (isHost) {
      const initial = createInitialState(Object.keys(playersRef.current))
      broadcastState(initial)
    }

    return () => {
      if (bustTimerRef.current) clearTimeout(bustTimerRef.current)
      channel.off('broadcast', { event: 'stopclock-state' }).off('broadcast', { event: 'stopclock-action' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel])

  useEffect(() => {
    if (!state || state.winnerId) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }
    function tick() {
      setDisplay(Math.min(elapsedNow(state), state.target))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [state])

  useEffect(() => {
    if (!state?.winnerId || finishedRef.current) return
    finishedRef.current = true
    setEnded(true)
    if (isHost) {
      const scores = computeFinalScores(state, Object.keys(playersRef.current))
      setTimeout(() => finishGame(scores), WIN_PAUSE_MS)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.winnerId])

  function handleStop() {
    if (!state || state.winnerId) return
    if (state.activePlayers[state.turnIndex] !== profile.id) return
    channelRef.current?.send({ type: 'broadcast', event: 'stopclock-action', payload: { playerId: profile.id } })
  }

  if (!state) {
    return (
      <div className="fixed inset-0 z-50 bg-canvas flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-primary-soft border-t-primary animate-spin" />
      </div>
    )
  }

  const myTurn = state.activePlayers[state.turnIndex] === profile.id
  const eliminatedSet = new Set(state.eliminatedOrder)
  const closeness = state.target > 0 ? Math.min(1, display / state.target) : 0
  const urgent = closeness > 0.85

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
        <p className="text-sm font-black">أوقف الساعة ⏱️</p>
        <div className="w-9" />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2.5 px-4 pt-4">
        {[...state.activePlayers, ...state.eliminatedOrder].map((id) => {
          const p = players[id]
          const isTurn = state.activePlayers[state.turnIndex] === id
          const out = eliminatedSet.has(id)
          return (
            <div
              key={id}
              className={`flex flex-col items-center gap-1 rounded-card px-2.5 py-2 border-2 transition-colors ${
                isTurn
                  ? 'border-primary bg-primary-soft'
                  : out
                    ? 'border-line bg-surface-2 opacity-45'
                    : 'border-line bg-surface'
              }`}
            >
              <Avatar name={p?.name} src={p?.avatarUrl} size="sm" />
              <span className="text-[0.65rem] font-bold truncate max-w-[4.5rem]">{p?.name}</span>
              {out && <span className="text-[0.6rem] font-black text-danger">خرج ❌</span>}
            </div>
          )
        })}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        <p className="text-sm font-black text-ink-muted">
          🎯 الهدف: <span className="text-primary">{formatTime(state.target)}</span> ثانية
        </p>

        <motion.div
          animate={urgent ? { scale: [1, 1.03, 1] } : {}}
          transition={{ repeat: urgent ? Infinity : 0, duration: 0.5 }}
          className={`text-6xl sm:text-7xl font-black tabular-nums ${urgent ? 'text-danger' : 'text-ink'}`}
        >
          {formatTime(display)}
        </motion.div>

        <div className="w-full max-w-xs h-2.5 rounded-full bg-surface-2 overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${urgent ? 'bg-danger' : 'bg-primary'}`}
            animate={{ width: `${closeness * 100}%` }}
            transition={{ ease: 'linear', duration: 0.1 }}
          />
        </div>

        <p className="text-sm font-black text-center">
          {myTurn ? 'دورك الحين! 🎯' : `دور ${players[state.activePlayers[state.turnIndex]]?.name || '؟'}...`}
        </p>

        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={handleStop}
          disabled={!myTurn}
          className="w-full max-w-xs bg-danger text-white font-black text-2xl rounded-btn py-6 shadow-pop disabled:opacity-30"
        >
          إيقاف 🛑
        </motion.button>

        <AnimatePresence mode="wait">
          {state.lastEvent?.type === 'success' && (
            <motion.p
              key={state.roundId + '-' + state.turnIndex}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs font-bold text-success"
            >
              ✅ {players[state.lastEvent.playerId]?.name} أوقفها عند {formatTime(state.lastEvent.stoppedAt)}
            </motion.p>
          )}
          {state.lastEvent?.type === 'bust' && (
            <motion.p
              key={'bust-' + state.roundId}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs font-bold text-danger"
            >
              ❌ {players[state.lastEvent.playerId]?.name} خرج عند {formatTime(state.lastEvent.stoppedAt)}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

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
              <p className="text-xl font-black text-primary">{players[state.winnerId]?.name || '؟'} فاز باللعبة!</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
