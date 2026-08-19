import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'
import {
  TARGET_SCORE,
  dealInitialState,
  drawCard,
  resolveDiscard,
  resolveSwapIn,
  resolvePowerSwap,
  resolvePowerKing,
  callScrew,
  startNextHand,
  computeFinalScores,
} from './logic'

const TURN_TIMEOUT_MS = 60000
const RESULT_PAUSE_MS = 5500
const MATCH_PAUSE_MS = 5500

const KIND_META = {
  'peek-own': { icon: '🔍', label: 'شوف كرتك' },
  'peek-opp': { icon: '🕵️', label: 'تجسس على خصم' },
  swap: { icon: '🔄', label: 'تبديل أعمى' },
  king: { icon: '👑', label: 'نظرة + تبديل' },
}

function CardFace({ card, size = 'md' }) {
  const dims = size === 'lg' ? 'w-16 h-24 text-2xl' : size === 'sm' ? 'w-11 h-16 text-base' : 'w-12 h-18 text-lg'
  if (!card) return <div className={`${dims} rounded-lg border-2 border-dashed border-line shrink-0`} />
  const isSpecial = card.kind !== 'number'
  return (
    <div
      className={`${dims} rounded-lg border-2 shadow-soft shrink-0 flex items-center justify-center font-black ${
        isSpecial ? 'bg-accent-soft border-accent text-accent' : 'bg-surface border-line text-ink'
      }`}
    >
      {isSpecial ? KIND_META[card.kind].icon : card.v}
    </div>
  )
}

function CardBack({ size = 'sm', highlight = false, onClick }) {
  const dims = size === 'lg' ? 'w-16 h-24' : size === 'sm' ? 'w-11 h-16' : 'w-9 h-14'
  const Comp = onClick ? motion.button : motion.div
  return (
    <Comp
      whileTap={onClick ? { scale: 0.9 } : undefined}
      onClick={onClick}
      className={`${dims} rounded-lg shrink-0 flex items-center justify-center border-2 ${
        highlight ? 'border-primary bg-primary-soft animate-pulse' : 'border-white/20 bg-ink'
      }`}
    >
      <span className={`text-[0.55em] font-black ${highlight ? 'text-primary' : 'text-white'}`}>؟</span>
    </Comp>
  )
}

export default function ScrewGameScreen({ profile, players, isHost, onExit, finishGame, channel }) {
  const [state, setState] = useState(null)
  const [powerFlow, setPowerFlow] = useState(null)
  const [swapInArmed, setSwapInArmed] = useState(false)
  const [reveal, setReveal] = useState(null)
  const [showInitialPeek, setShowInitialPeek] = useState(false)
  const [ended, setEnded] = useState(false)

  const channelRef = useRef(null)
  const stateRef = useRef(null)
  const playersRef = useRef(players)
  const turnTimerRef = useRef(null)
  const resolvedTurnRef = useRef(null)
  const finishedRef = useRef(false)
  const lastHandIdRef = useRef(null)

  useEffect(() => {
    playersRef.current = players
  }, [players])
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const broadcastState = useCallback((next) => {
    channelRef.current?.send({ type: 'broadcast', event: 'screw-state', payload: next })
  }, [])

  const armTurnTimer = useCallback(
    (s) => {
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current)
      if (s.handEnded || s.matchWinnerId) return
      turnTimerRef.current = setTimeout(() => {
        if (resolvedTurnRef.current === s.turnId) return
        resolvedTurnRef.current = s.turnId
        const cur = s.turnOrder[s.turnIndex]
        const next = s.pendingDraw ? resolveDiscard(s, cur) : drawCard(s, cur)
        broadcastState(next)
      }, TURN_TIMEOUT_MS)
    },
    [broadcastState]
  )

  useEffect(() => {
    if (!channel) return
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'screw-state' }, ({ payload }) => {
        resolvedTurnRef.current = null
        setState(payload)
        if (isHost) armTurnTimer(payload)
      })
      .on('broadcast', { event: 'screw-action' }, ({ payload }) => {
        if (!isHost) return
        const s = stateRef.current
        if (!s) return
        let next = s
        if (payload.type === 'draw') next = drawCard(s, payload.playerId)
        else if (payload.type === 'discard') next = resolveDiscard(s, payload.playerId)
        else if (payload.type === 'swap-in') next = resolveSwapIn(s, payload.playerId, payload.slotIndex)
        else if (payload.type === 'power-swap')
          next = resolvePowerSwap(s, payload.playerId, payload.targetPlayerId, payload.myIndex, payload.targetIndex)
        else if (payload.type === 'power-king')
          next = resolvePowerKing(
            s,
            payload.playerId,
            payload.targetPlayerId,
            payload.myIndex,
            payload.targetIndex,
            payload.doSwap
          )
        else if (payload.type === 'call-screw') next = callScrew(s, payload.playerId)
        if (next !== s) broadcastState(next)
      })

    if (isHost) {
      const initial = dealInitialState(Object.keys(playersRef.current))
      broadcastState(initial)
    }

    return () => {
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current)
      channel.off('broadcast', { event: 'screw-state' }).off('broadcast', { event: 'screw-action' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel])

  useEffect(() => {
    if (state?.handId && state.handId !== lastHandIdRef.current) {
      lastHandIdRef.current = state.handId
      setShowInitialPeek(true)
      setPowerFlow(null)
      setSwapInArmed(false)
      setReveal(null)
    }
  }, [state?.handId])

  useEffect(() => {
    if (!state?.handEnded || state.matchWinnerId || !isHost) return
    const t = setTimeout(() => {
      const s = stateRef.current
      if (!s?.handEnded || s.matchWinnerId) return
      broadcastState(startNextHand(s))
    }, RESULT_PAUSE_MS)
    return () => clearTimeout(t)
  }, [state?.handEnded, state?.matchWinnerId, isHost, broadcastState])

  useEffect(() => {
    if (!state?.matchWinnerId || finishedRef.current) return
    finishedRef.current = true
    setEnded(true)
    if (isHost) {
      const scores = computeFinalScores(state)
      setTimeout(() => finishGame(scores), MATCH_PAUSE_MS)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.matchWinnerId])

  function sendAction(payload) {
    channelRef.current?.send({ type: 'broadcast', event: 'screw-action', payload })
  }

  if (!state) {
    return (
      <div className="fixed inset-0 z-50 bg-canvas flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-primary-soft border-t-primary animate-spin" />
      </div>
    )
  }

  const myTurn = state.turnOrder[state.turnIndex] === profile.id && !state.handEnded
  const myHand = state.hands[profile.id] || []
  const others = state.turnOrder.filter((id) => id !== profile.id)
  const top = state.discard[state.discard.length - 1]

  function handleDrawCard() {
    if (!myTurn || state.pendingDraw) return
    sendAction({ type: 'draw', playerId: profile.id })
  }

  function handleCallScrew() {
    if (!myTurn || state.pendingDraw || state.screwCallerId) return
    sendAction({ type: 'call-screw', playerId: profile.id })
  }

  function startPrimaryPower() {
    const kind = state.pendingDraw.card.kind
    if (kind === 'number') {
      sendAction({ type: 'discard', playerId: profile.id })
      return
    }
    if (kind === 'peek-own') setPowerFlow({ kind, step: 'pick-own' })
    else if (kind === 'peek-opp') setPowerFlow({ kind, step: 'pick-opp-player' })
    else setPowerFlow({ kind, step: 'pick-my-slot' })
  }

  function handleSwapInSlot(idx) {
    setSwapInArmed(false)
    sendAction({ type: 'swap-in', playerId: profile.id, slotIndex: idx })
  }

  function handlePeekOwnSlot(idx) {
    const card = myHand[idx]
    setPowerFlow(null)
    setReveal({
      title: 'كرتك:',
      cells: [{ label: `الخانة ${idx + 1}`, card }],
      onConfirm: () => {
        sendAction({ type: 'discard', playerId: profile.id })
        setReveal(null)
      },
    })
  }

  function handlePickOppPlayer(targetPlayerId) {
    setPowerFlow((f) => ({ ...f, step: 'pick-opp-slot', targetPlayerId }))
  }

  function handlePeekOppSlot(targetPlayerId, idx) {
    const card = state.hands[targetPlayerId][idx]
    const name = players[targetPlayerId]?.name || '؟'
    setPowerFlow(null)
    setReveal({
      title: `كرت ${name}:`,
      cells: [{ label: `الخانة ${idx + 1}`, card }],
      onConfirm: () => {
        sendAction({ type: 'discard', playerId: profile.id })
        setReveal(null)
      },
    })
  }

  function handleSwapPickMySlot(idx) {
    setPowerFlow({ kind: 'swap', step: 'pick-opp-player', myIndex: idx })
  }

  function handleSwapPickOppSlot(targetPlayerId, idx) {
    const { myIndex } = powerFlow
    setPowerFlow(null)
    sendAction({ type: 'power-swap', playerId: profile.id, targetPlayerId, myIndex, targetIndex: idx })
  }

  function handleKingPickMySlot(idx) {
    setPowerFlow({ kind: 'king', step: 'pick-opp-player', myIndex: idx })
  }

  function handleKingPickOppSlot(targetPlayerId, idx) {
    const { myIndex } = powerFlow
    const myCard = myHand[myIndex]
    const theirCard = state.hands[targetPlayerId][idx]
    const theirName = players[targetPlayerId]?.name || '؟'
    setPowerFlow(null)
    setReveal({
      title: 'شفت الكرتين:',
      cells: [
        { label: 'كرتك', card: myCard },
        { label: theirName, card: theirCard },
      ],
      kingChoice: { targetPlayerId, myIndex, targetIndex: idx },
    })
  }

  function confirmKing(doSwap) {
    const { targetPlayerId, myIndex, targetIndex } = reveal.kingChoice
    sendAction({ type: 'power-king', playerId: profile.id, targetPlayerId, myIndex, targetIndex, doSwap })
    setReveal(null)
  }

  const pickingMySlot =
    swapInArmed ||
    (powerFlow?.kind === 'peek-own' && powerFlow.step === 'pick-own') ||
    (powerFlow?.kind === 'swap' && powerFlow.step === 'pick-my-slot') ||
    (powerFlow?.kind === 'king' && powerFlow.step === 'pick-my-slot')

  function onMySlotClick(idx) {
    if (swapInArmed) return handleSwapInSlot(idx)
    if (powerFlow?.kind === 'peek-own' && powerFlow.step === 'pick-own') return handlePeekOwnSlot(idx)
    if (powerFlow?.kind === 'swap' && powerFlow.step === 'pick-my-slot') return handleSwapPickMySlot(idx)
    if (powerFlow?.kind === 'king' && powerFlow.step === 'pick-my-slot') return handleKingPickMySlot(idx)
  }

  const pickingOppPlayer =
    powerFlow?.step === 'pick-opp-player' && ['peek-opp', 'swap', 'king'].includes(powerFlow.kind)
  const pickingOppSlotFor = powerFlow?.step === 'pick-opp-slot' ? powerFlow.targetPlayerId : null

  function onOppSlotClick(targetPlayerId, idx) {
    if (powerFlow?.kind === 'peek-opp') return handlePeekOppSlot(targetPlayerId, idx)
    if (powerFlow?.kind === 'swap') return handleSwapPickOppSlot(targetPlayerId, idx)
    if (powerFlow?.kind === 'king') return handleKingPickOppSlot(targetPlayerId, idx)
  }

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
          <p className="text-xs text-ink-muted font-bold">سكرو</p>
          <p className="text-[0.65rem] text-ink-muted">الهدف: أقل مجموع، حتى {TARGET_SCORE}</p>
        </div>
        <div className="w-9" />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 px-4 pt-2">
        {state.turnOrder.map((id) => (
          <div key={id} className="flex items-center gap-1 bg-surface-2 rounded-pill px-2.5 py-1">
            <span className="text-[0.65rem] font-bold">{players[id]?.name}</span>
            <span className="text-[0.65rem] font-black text-primary">{state.totalScores[id] || 0}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 px-4 pt-3">
        {others.map((id) => {
          const isTurn = state.turnOrder[state.turnIndex] === id
          const clickableSlot = pickingOppPlayer || pickingOppSlotFor === id
          return (
            <div
              key={id}
              className={`flex flex-col items-center gap-1.5 rounded-card px-2.5 py-2 border-2 transition-colors ${
                isTurn ? 'border-primary bg-primary-soft' : 'border-line bg-surface'
              } ${pickingOppPlayer ? 'cursor-pointer' : ''}`}
              onClick={() => pickingOppPlayer && handlePickOppPlayer(id)}
            >
              <Avatar name={players[id]?.name} src={players[id]?.avatarUrl} size="sm" />
              <span className="text-[0.65rem] font-bold truncate max-w-[4.5rem]">{players[id]?.name}</span>
              <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <CardBack
                    key={i}
                    size="sm"
                    highlight={pickingOppSlotFor === id}
                    onClick={pickingOppSlotFor === id ? () => onOppSlotClick(id, i) : undefined}
                  />
                ))}
              </div>
              {state.screwCallerId === id && <span className="text-[0.6rem] font-black text-danger">قال سكرو! 🛑</span>}
            </div>
          )
        })}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
        <div className="flex items-center gap-4">
          <button onClick={handleDrawCard} disabled={!myTurn || !!state.pendingDraw} className="flex flex-col items-center gap-1 disabled:opacity-40">
            <CardBack size="lg" />
            <span className="text-xs font-bold text-ink-muted">اسحب</span>
          </button>
          <div className="flex flex-col items-center gap-1">
            <CardFace card={top} size="lg" />
            <span className="text-xs font-bold text-ink-muted">آخر رمية</span>
          </div>
        </div>

        {myTurn && state.pendingDraw && !powerFlow && !swapInArmed && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-3 w-full max-w-xs">
            <p className="text-xs text-ink-muted font-bold">سحبت هالكرت 👇</p>
            <CardFace card={state.pendingDraw.card} size="lg" />
            <div className="flex gap-2 w-full">
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => setSwapInArmed(true)} className="flex-1 bg-surface-2 text-ink font-black text-sm rounded-btn py-3">
                🔄 بدّل بكرتك
              </motion.button>
              <motion.button whileTap={{ scale: 0.95 }} onClick={startPrimaryPower} className="flex-1 bg-primary text-primary-ink font-black text-sm rounded-btn py-3">
                {state.pendingDraw.card.kind === 'number' ? '🗑️ ارمها' : `${KIND_META[state.pendingDraw.card.kind].icon} استخدم`}
              </motion.button>
            </div>
          </motion.div>
        )}

        {myTurn && !state.pendingDraw && !state.screwCallerId && (
          <motion.button whileTap={{ scale: 0.95 }} onClick={handleCallScrew} className="bg-danger text-white font-black text-lg rounded-pill px-8 py-3 shadow-pop">
            سكرو! 🛑
          </motion.button>
        )}

        <div className="flex flex-col items-center gap-1.5">
          <p className="text-xs font-bold text-ink-muted">كروتك</p>
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <CardBack key={i} size="md" highlight={pickingMySlot} onClick={pickingMySlot ? () => onMySlotClick(i) : undefined} />
            ))}
          </div>
        </div>

        {!myTurn && !state.handEnded && (
          <p className="text-sm font-black text-center">دور {players[state.turnOrder[state.turnIndex]]?.name || '؟'}...</p>
        )}
      </div>

      <AnimatePresence>
        {showInitialPeek && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-20 bg-black/60 flex items-center justify-center px-8">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-surface rounded-card p-6 flex flex-col items-center gap-4 w-full max-w-xs">
              <p className="font-black text-center">شوف كرتينك واحفظهم زين 🧠</p>
              <div className="flex gap-3">
                {(state.initialPeek[profile.id] || []).map((idx) => (
                  <div key={idx} className="flex flex-col items-center gap-1">
                    <CardFace card={myHand[idx]} size="lg" />
                    <span className="text-[0.65rem] text-ink-muted font-bold">خانة {idx + 1}</span>
                  </div>
                ))}
              </div>
              <motion.button whileTap={{ scale: 0.96 }} onClick={() => setShowInitialPeek(false)} className="w-full bg-primary text-primary-ink font-black rounded-btn py-3">
                فهمت، يلا نبدأ 🎬
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reveal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-20 bg-black/60 flex items-center justify-center px-8">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-surface rounded-card p-6 flex flex-col items-center gap-4 w-full max-w-xs">
              <p className="font-black text-center">{reveal.title}</p>
              <div className="flex gap-3">
                {reveal.cells.map((c, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <CardFace card={c.card} size="lg" />
                    <span className="text-[0.65rem] text-ink-muted font-bold">{c.label}</span>
                  </div>
                ))}
              </div>
              {reveal.kingChoice ? (
                <div className="flex gap-2 w-full">
                  <motion.button whileTap={{ scale: 0.96 }} onClick={() => confirmKing(true)} className="flex-1 bg-primary text-primary-ink font-black rounded-btn py-3">
                    بدّلهم 🔄
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.96 }} onClick={() => confirmKing(false)} className="flex-1 bg-surface-2 text-ink font-black rounded-btn py-3">
                    خلهم كذا
                  </motion.button>
                </div>
              ) : (
                <motion.button whileTap={{ scale: 0.96 }} onClick={reveal.onConfirm} className="w-full bg-primary text-primary-ink font-black rounded-btn py-3">
                  فهمت ✅
                </motion.button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {state.handEnded && !state.matchWinnerId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-20 bg-black/60 flex items-center justify-center px-6 overflow-y-auto py-8">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-surface rounded-card p-6 flex flex-col items-center gap-3 w-full max-w-sm">
              <span className="text-5xl">🃏</span>
              <p className="font-black text-lg text-primary">{players[state.handWinnerId]?.name} أخذ اليد!</p>
              <div className="w-full flex flex-col gap-2">
                {state.turnOrder.map((id) => (
                  <div key={id} className="bg-surface-2 rounded-btn px-3 py-2 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-bold">{players[id]?.name}</span>
                      <span className="font-black">
                        +{state.handSums?.[id] ?? 0} = <span className="text-primary">{state.totalScores[id]}</span>
                      </span>
                    </div>
                    <div className="flex gap-1.5 justify-center">
                      {(state.hands[id] || []).map((c, i) => (
                        <CardFace key={i} card={c} size="sm" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {ended && state.matchWinnerId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-20 bg-black/60 flex items-center justify-center px-8">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-surface rounded-card p-8 flex flex-col items-center gap-3 text-center">
              <span className="text-6xl">🏆</span>
              <p className="text-xl font-black text-primary">{players[state.matchWinnerId]?.name || '؟'} فاز بأقل مجموع!</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
