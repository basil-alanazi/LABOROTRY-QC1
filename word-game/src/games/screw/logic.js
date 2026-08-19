export const TARGET_SCORE = 100
export const GRID_SIZE = 4

export function createDeck() {
  const deck = []
  const push = (v, kind, n) => {
    for (let i = 0; i < n; i++) deck.push({ v, kind })
  }
  push(0, 'number', 12)
  for (let v = 1; v <= 9; v++) push(v, 'number', 8)
  push(0, 'peek-own', 6)
  push(0, 'peek-opp', 6)
  push(0, 'swap', 6)
  push(0, 'king', 4)
  return deck
}

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function nextIndex(idx, len) {
  return (idx + 1) % len
}

function refillDeckIfNeeded(state, count) {
  while (state.deck.length < count && state.discard.length > 1) {
    const top = state.discard[state.discard.length - 1]
    const rest = state.discard.slice(0, -1)
    state.deck.push(...shuffle(rest))
    state.discard = [top]
  }
}

function drawFromDeck(state) {
  refillDeckIfNeeded(state, 1)
  if (state.deck.length === 0) return { v: 0, kind: 'number' }
  return state.deck.shift()
}

function handSum(hand) {
  return hand.reduce((sum, c) => sum + c.v, 0)
}

function startHand(playerIds, startIndex, totalScores) {
  const state = {
    handId: crypto.randomUUID(),
    deck: shuffle(createDeck()),
    discard: [],
    hands: {},
    initialPeek: {},
    turnOrder: [...playerIds],
    turnIndex: startIndex % playerIds.length,
    pendingDraw: null,
    handEnded: false,
    handWinnerId: null,
    handSums: null,
    screwCallerId: null,
    turnsAfterScrew: 0,
    matchWinnerId: null,
    totalScores: { ...totalScores },
    turnId: crypto.randomUUID(),
    lastAction: { type: 'hand-start' },
  }

  for (const pid of playerIds) {
    state.hands[pid] = state.deck.splice(0, GRID_SIZE)
    const idxs = [0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, 2)
    state.initialPeek[pid] = idxs
  }

  state.discard = [state.deck.shift()]

  return state
}

export function dealInitialState(playerIds) {
  const totalScores = {}
  for (const pid of playerIds) totalScores[pid] = 0
  return startHand(playerIds, 0, totalScores)
}

function currentPlayer(state) {
  return state.turnOrder[state.turnIndex]
}

export function drawCard(state, playerId) {
  if (state.matchWinnerId) return state
  if (currentPlayer(state) !== playerId) return state
  if (state.pendingDraw) return state
  const next = { ...state, deck: [...state.deck], discard: [...state.discard] }
  const card = drawFromDeck(next)
  next.pendingDraw = { playerId, card }
  next.turnId = crypto.randomUUID()
  return next
}

function afterTurnEnds(state) {
  const next = { ...state, pendingDraw: null }
  if (next.screwCallerId) {
    next.turnsAfterScrew += 1
  }
  next.turnIndex = nextIndex(next.turnIndex, next.turnOrder.length)
  next.turnId = crypto.randomUUID()

  if (next.screwCallerId && next.turnOrder[next.turnIndex] === next.screwCallerId) {
    return endHand(next)
  }
  return next
}

export function resolveDiscard(state, playerId) {
  if (state.matchWinnerId) return state
  if (currentPlayer(state) !== playerId) return state
  if (!state.pendingDraw || state.pendingDraw.playerId !== playerId) return state

  const next = { ...state, discard: [...state.discard, state.pendingDraw.card] }
  next.lastAction = { type: 'discard', by: playerId, card: state.pendingDraw.card }
  return afterTurnEnds(next)
}

export function resolveSwapIn(state, playerId, slotIndex) {
  if (state.matchWinnerId) return state
  if (currentPlayer(state) !== playerId) return state
  if (!state.pendingDraw || state.pendingDraw.playerId !== playerId) return state
  if (slotIndex < 0 || slotIndex >= GRID_SIZE) return state

  const hand = [...state.hands[playerId]]
  const removed = hand[slotIndex]
  hand[slotIndex] = state.pendingDraw.card
  const next = {
    ...state,
    hands: { ...state.hands, [playerId]: hand },
    discard: [...state.discard, removed],
  }
  next.lastAction = { type: 'swap-in', by: playerId, slotIndex }
  return afterTurnEnds(next)
}

export function resolvePowerSwap(state, playerId, targetPlayerId, myIndex, targetIndex) {
  if (state.matchWinnerId) return state
  if (currentPlayer(state) !== playerId) return state
  if (!state.pendingDraw || state.pendingDraw.playerId !== playerId) return state
  if (state.pendingDraw.card.kind !== 'swap') return state
  if (targetPlayerId === playerId) return state

  const myHand = [...state.hands[playerId]]
  const targetHand = [...state.hands[targetPlayerId]]
  const tmp = myHand[myIndex]
  myHand[myIndex] = targetHand[targetIndex]
  targetHand[targetIndex] = tmp

  const next = {
    ...state,
    hands: { ...state.hands, [playerId]: myHand, [targetPlayerId]: targetHand },
    discard: [...state.discard, state.pendingDraw.card],
  }
  next.lastAction = { type: 'power-swap', by: playerId, targetPlayerId }
  return afterTurnEnds(next)
}

export function resolvePowerKing(state, playerId, targetPlayerId, myIndex, targetIndex, doSwap) {
  if (state.matchWinnerId) return state
  if (currentPlayer(state) !== playerId) return state
  if (!state.pendingDraw || state.pendingDraw.playerId !== playerId) return state
  if (state.pendingDraw.card.kind !== 'king') return state
  if (targetPlayerId === playerId) return state

  let hands = state.hands
  if (doSwap) {
    const myHand = [...state.hands[playerId]]
    const targetHand = [...state.hands[targetPlayerId]]
    const tmp = myHand[myIndex]
    myHand[myIndex] = targetHand[targetIndex]
    targetHand[targetIndex] = tmp
    hands = { ...state.hands, [playerId]: myHand, [targetPlayerId]: targetHand }
  }

  const next = {
    ...state,
    hands,
    discard: [...state.discard, state.pendingDraw.card],
  }
  next.lastAction = { type: 'power-king', by: playerId, targetPlayerId, doSwap }
  return afterTurnEnds(next)
}

export function callScrew(state, playerId) {
  if (state.matchWinnerId) return state
  if (currentPlayer(state) !== playerId) return state
  if (state.pendingDraw) return state
  if (state.screwCallerId) return state

  const next = { ...state, screwCallerId: playerId }
  next.lastAction = { type: 'call-screw', by: playerId }
  return afterTurnEnds(next)
}

function endHand(state) {
  const sums = {}
  for (const [pid, hand] of Object.entries(state.hands)) {
    sums[pid] = handSum(hand)
  }
  const handWinnerId = Object.keys(sums).reduce((best, pid) => (sums[pid] < sums[best] ? pid : best))

  const totalScores = { ...state.totalScores }
  for (const [pid, sum] of Object.entries(sums)) {
    totalScores[pid] = (totalScores[pid] || 0) + sum
  }

  const someoneOver = Object.values(totalScores).some((s) => s >= TARGET_SCORE)
  const matchWinnerId = someoneOver
    ? Object.keys(totalScores).reduce((best, pid) => (totalScores[pid] < totalScores[best] ? pid : best))
    : null

  return {
    ...state,
    handEnded: true,
    handWinnerId,
    handSums: sums,
    totalScores,
    matchWinnerId,
    turnId: crypto.randomUUID(),
    lastAction: matchWinnerId ? { type: 'match-end', winnerId: matchWinnerId } : { type: 'hand-end' },
  }
}

export function startNextHand(state) {
  const startIdx = (state.turnOrder.indexOf(state.screwCallerId) + 1) % state.turnOrder.length
  return startHand(state.turnOrder, startIdx, state.totalScores)
}

export function computeFinalScores(state) {
  const scores = {}
  const maxTotal = Math.max(...Object.values(state.totalScores))
  for (const [pid, total] of Object.entries(state.totalScores)) {
    scores[pid] = Math.max(0, (maxTotal - total) * 2)
  }
  if (state.matchWinnerId) scores[state.matchWinnerId] = (scores[state.matchWinnerId] || 0) + 100
  return scores
}
