import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'
import { createInitialState, processStop, processBust, computeFinalScores } from './logic'

const WIN_PAUSE_MS = 5000
const BUST_GRACE_MS = 120
const FLASH_MS = 1500

function formatTarget(seconds) {
  return Math.max(0, seconds).toFixed(2)
}

export default function StopClockGameScreen({ profile, players, isHost, onExit, finishGame, channel }) {
  const [state, setState] = useState(null)
  const [flash, setFlash] = useState(null) // { type: 'success' | 'bust', playerId }
  const [ended, setEnded] = useState(false)

  const channelRef = useRef(null)
  const stateRef = useRef(null)
  const playersRef = useRef(players)
  const bustTimerRef = useRef(null)
  const resolvedTokenRef = useRef(null)
  const finishedRef = useRef(false)

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
    if (!state?.lastEvent || state.lastEvent.type === 'start') return
    setFlash({ type: state.lastEvent.type, playerId: state.lastEvent.playerId })
    const t = setTimeout(() => setFlash(null), FLASH_MS)
    return () => clearTimeout(t)
  }, [state?.lastEvent])

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

      <div className="flex-1 flex flex-col items-center justify-center gap-7 px-6">
        <p className="text-sm font-black text-ink-muted">
          🎯 الهدف: <span className="text-primary">{formatTarget(state.target)}</span> ثانية
        </p>

        <div className="relative w-40 h-40 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {flash ? (
              <motion.div
                key="flash"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className={`w-40 h-40 rounded-full flex items-center justify-center text-6xl ${
                  flash.type === 'success' ? 'bg-success-soft' : 'bg-danger-soft'
                }`}
              >
                {flash.type === 'success' ? '✅' : '❌'}
              </motion.div>
            ) : (
              <motion.div
                key="pulse"
                animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
                className="w-40 h-40 rounded-full bg-primary-soft flex items-center justify-center text-6xl"
              >
                ⏱️
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-sm font-black text-center">
          {flash
            ? flash.type === 'success'
              ? `${players[flash.playerId]?.name || '؟'} أوقفها قبل الهدف! ✅`
              : `${players[flash.playerId]?.name || '؟'} عدّى الهدف! ❌`
            : myTurn
              ? 'دورك الحين! 🎯'
              : `دور ${players[state.activePlayers[state.turnIndex]]?.name || '؟'}...`}
        </p>

        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={handleStop}
          disabled={!myTurn}
          className="w-full max-w-xs bg-danger text-white font-black text-2xl rounded-btn py-6 shadow-pop disabled:opacity-30"
        >
          إيقاف 🛑
        </motion.button>
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
