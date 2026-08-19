export const LIGHT_COLORS = ['red', 'yellow', 'green', 'blue']
export const DARK_COLORS = ['pink', 'teal', 'orange', 'purple']

export const LIGHT_META = {
  red: { bg: '#ef4444', label: 'أحمر' },
  yellow: { bg: '#eab308', label: 'أصفر' },
  green: { bg: '#22c55e', label: 'أخضر' },
  blue: { bg: '#3b82f6', label: 'أزرق' },
}

export const DARK_META = {
  pink: { bg: '#ec4899', label: 'وردي' },
  teal: { bg: '#14b8a6', label: 'تركواز' },
  orange: { bg: '#f97316', label: 'برتقالي' },
  purple: { bg: '#a855f7', label: 'بنفسجي' },
}

export function metaFor(side) {
  return side === 'dark' ? DARK_META : LIGHT_META
}

export function paletteFor(side) {
  return side === 'dark' ? DARK_COLORS : LIGHT_COLORS
}

export function createDeck() {
  const deck = []
  for (let ci = 0; ci < 4; ci++) {
    deck.push(`${ci}-0`)
    for (let n = 1; n <= 9; n++) {
      deck.push(`${ci}-${n}`, `${ci}-${n}`)
    }
    for (const k of ['skip', 'reverse', 'draw', 'flip']) {
      deck.push(`${ci}-${k}`, `${ci}-${k}`)
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push('wild', 'wilddraw')
  }
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

export function isWild(cardId) {
  return cardId === 'wild' || cardId === 'wilddraw'
}

export function colorOf(cardId, side) {
  if (isWild(cardId)) return null
  const ci = Number(cardId.split('-')[0])
  return paletteFor(side)[ci]
}

export function kindOf(cardId) {
  if (isWild(cardId)) return cardId
  return cardId.split('-')[1]
}

export function drawAmount(side) {
  return side === 'dark' ? 5 : 2
}

export function wildDrawAmount() {
  return 4
}

export const UNO_PENALTY = 2

export function cardPoints(cardId) {
  if (isWild(cardId)) return cardId === 'wilddraw' ? 60 : 40
  const k = kindOf(cardId)
  if (['skip', 'reverse', 'draw', 'flip'].includes(k)) return 20
  return Number(k)
}

function nextIndex(idx, len, dir) {
  return (idx + dir + len) % len
}

function removeOne(arr, item) {
  const idx = arr.indexOf(item)
  if (idx === -1) return arr
  return [...arr.slice(0, idx), ...arr.slice(idx + 1)]
}

function refillDeckIfNeeded(state, count) {
  while (state.deck.length < count && state.discard.length > 1) {
    const top = state.discard[state.discard.length - 1]
    const rest = state.discard.slice(0, -1)
    state.deck.push(...shuffle(rest))
    state.discard = [top]
  }
}

function drawCards(state, n) {
  refillDeckIfNeeded(state, n)
  return state.deck.splice(0, n)
}

function drawUntilColor(state, targetColor) {
  const drawn = []
  const cap = 200
  for (let i = 0; i < cap; i++) {
    refillDeckIfNeeded(state, 1)
    if (state.deck.length === 0) break
    const card = state.deck.shift()
    drawn.push(card)
    if (!isWild(card) && colorOf(card, state.side) === targetColor) break
  }
  return drawn
}

const NON_STARTER_KINDS = new Set(['flip'])

function isEligibleStarter(cardId) {
  return !isWild(cardId) && !NON_STARTER_KINDS.has(kindOf(cardId))
}

export function dealInitialState(playerIds) {
  const state = {
    deck: shuffle(createDeck()),
    discard: [],
    hands: {},
    turnOrder: [...playerIds],
    turnIndex: 0,
    direction: 1,
    side: 'light',
    currentColor: null,
    winnerId: null,
    unoPending: null,
    turnId: crypto.randomUUID(),
    lastAction: { type: 'start' },
  }

  for (const pid of playerIds) {
    state.hands[pid] = state.deck.splice(0, 7)
  }

  let starterIdx = state.deck.findIndex(isEligibleStarter)
  if (starterIdx === -1) {
    state.deck.push(...shuffle(createDeck().filter(isEligibleStarter)))
    starterIdx = state.deck.findIndex(isEligibleStarter)
  }
  const starter = state.deck.splice(starterIdx, 1)[0]
  state.discard = [starter]
  state.currentColor = colorOf(starter, state.side)

  const kind = kindOf(starter)
  if (kind === 'skip') {
    state.turnIndex = nextIndex(state.turnIndex, state.turnOrder.length, state.direction)
  } else if (kind === 'reverse') {
    state.direction = -1
    if (state.turnOrder.length > 2) {
      state.turnIndex = nextIndex(state.turnIndex, state.turnOrder.length, state.direction)
    }
  } else if (kind === 'draw') {
    const first = state.turnOrder[state.turnIndex]
    state.hands[first] = [...state.hands[first], ...drawCards(state, drawAmount(state.side))]
    state.turnIndex = nextIndex(state.turnIndex, state.turnOrder.length, state.direction)
  }

  return state
}

export function playCard(state, playerId, cardId, chosenColor, saidUno = false) {
  if (state.winnerId) return state
  if (state.turnOrder[state.turnIndex] !== playerId) return state
  const hand = state.hands[playerId]
  if (!hand || !hand.includes(cardId)) return state

  const top = state.discard[state.discard.length - 1]
  const cardColor = colorOf(cardId, state.side)
  const topColor = colorOf(top, state.side)
  const playable =
    isWild(cardId) ||
    cardColor === state.currentColor ||
    kindOf(cardId) === kindOf(top) ||
    (topColor !== null && cardColor === topColor)
  if (!playable) return state

  const next = {
    ...state,
    hands: { ...state.hands, [playerId]: removeOne(hand, cardId) },
    discard: [...state.discard, cardId],
  }

  if (isWild(cardId)) {
    const palette = paletteFor(next.side)
    next.currentColor = palette.includes(chosenColor) ? chosenColor : palette[0]
  } else {
    next.currentColor = colorOf(cardId, next.side)
  }

  if (next.hands[playerId].length === 0) {
    next.winnerId = playerId
    next.unoPending = null
    next.turnId = crypto.randomUUID()
    next.lastAction = { type: 'win', by: playerId, card: cardId }
    return next
  }

  const kind = kindOf(cardId)
  let steps = 1
  if (kind === 'skip') {
    steps = next.side === 'dark' ? 0 : 2
  } else if (kind === 'reverse') {
    next.direction = next.direction * -1
    steps = next.turnOrder.length === 2 ? 2 : 1
  } else if (kind === 'draw') {
    const victimIdx = nextIndex(next.turnIndex, next.turnOrder.length, next.direction)
    const victim = next.turnOrder[victimIdx]
    next.hands[victim] = [...next.hands[victim], ...drawCards(next, drawAmount(next.side))]
    steps = 2
  } else if (kind === 'wilddraw') {
    const victimIdx = nextIndex(next.turnIndex, next.turnOrder.length, next.direction)
    const victim = next.turnOrder[victimIdx]
    const drawn = next.side === 'dark' ? drawUntilColor(next, next.currentColor) : drawCards(next, wildDrawAmount(next.side))
    next.hands[victim] = [...next.hands[victim], ...drawn]
    steps = 2
  } else if (kind === 'flip') {
    next.side = next.side === 'light' ? 'dark' : 'light'
    next.currentColor = colorOf(cardId, next.side)
    steps = 1
  }

  for (let i = 0; i < steps; i++) {
    next.turnIndex = nextIndex(next.turnIndex, next.turnOrder.length, next.direction)
  }
  next.unoPending = next.hands[playerId].length === 1 && !saidUno ? { playerId } : state.unoPending
  next.turnId = crypto.randomUUID()
  next.lastAction = { type: 'play', by: playerId, card: cardId, color: next.currentColor, side: next.side }
  return next
}

export function drawCardForPlayer(state, playerId) {
  if (state.winnerId) return state
  if (state.turnOrder[state.turnIndex] !== playerId) return state

  const next = { ...state, hands: { ...state.hands } }
  next.hands[playerId] = [...next.hands[playerId], ...drawCards(next, 1)]
  next.turnIndex = nextIndex(next.turnIndex, next.turnOrder.length, next.direction)
  if (next.unoPending?.playerId === playerId) next.unoPending = null
  next.turnId = crypto.randomUUID()
  next.lastAction = { type: 'draw', by: playerId }
  return next
}

export function callUno(state, playerId) {
  if (state.unoPending?.playerId !== playerId) return state
  return { ...state, unoPending: null, turnId: crypto.randomUUID(), lastAction: { type: 'call-uno', by: playerId } }
}

export function catchUno(state, targetPlayerId, byPlayerId) {
  if (state.unoPending?.playerId !== targetPlayerId) return state
  if (targetPlayerId === byPlayerId) return state
  const next = { ...state, hands: { ...state.hands } }
  next.hands[targetPlayerId] = [...next.hands[targetPlayerId], ...drawCards(next, UNO_PENALTY)]
  next.unoPending = null
  next.turnId = crypto.randomUUID()
  next.lastAction = { type: 'uno-penalty', by: byPlayerId, target: targetPlayerId }
  return next
}

export function computeFinalScores(state) {
  const scores = {}
  if (!state.winnerId) return scores
  let total = 0
  for (const [pid, hand] of Object.entries(state.hands)) {
    if (pid === state.winnerId) continue
    total += hand.reduce((sum, c) => sum + cardPoints(c), 0)
  }
  scores[state.winnerId] = total
  for (const pid of Object.keys(state.hands)) {
    if (pid !== state.winnerId) scores[pid] = 0
  }
  return scores
}
