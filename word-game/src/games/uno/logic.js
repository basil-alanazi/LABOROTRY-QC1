export const COLORS = ['red', 'yellow', 'green', 'blue']

export const COLOR_META = {
  red: { bg: '#ef4444', label: 'أحمر' },
  yellow: { bg: '#eab308', label: 'أصفر' },
  green: { bg: '#22c55e', label: 'أخضر' },
  blue: { bg: '#3b82f6', label: 'أزرق' },
}

export function createDeck() {
  const deck = []
  for (const c of COLORS) {
    deck.push(`${c}-0`)
    for (let n = 1; n <= 9; n++) {
      deck.push(`${c}-${n}`, `${c}-${n}`)
    }
    for (const action of ['skip', 'reverse', 'draw2']) {
      deck.push(`${c}-${action}`, `${c}-${action}`)
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push('wild', 'wild4')
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
  return cardId === 'wild' || cardId === 'wild4'
}

export function colorOf(cardId) {
  if (isWild(cardId)) return null
  return cardId.split('-')[0]
}

export function kindOf(cardId) {
  if (isWild(cardId)) return cardId
  const parts = cardId.split('-')
  return parts[1]
}

export function isActionCard(cardId) {
  return ['skip', 'reverse', 'draw2'].includes(kindOf(cardId))
}

export function cardPoints(cardId) {
  if (isWild(cardId)) return 50
  const k = kindOf(cardId)
  if (['skip', 'reverse', 'draw2'].includes(k)) return 20
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
  const drawn = state.deck.splice(0, n)
  return drawn
}

export function dealInitialState(playerIds) {
  const state = {
    deck: shuffle(createDeck()),
    discard: [],
    hands: {},
    turnOrder: [...playerIds],
    turnIndex: 0,
    direction: 1,
    currentColor: null,
    winnerId: null,
    turnId: crypto.randomUUID(),
    lastAction: { type: 'start' },
  }

  for (const pid of playerIds) {
    state.hands[pid] = state.deck.splice(0, 7)
  }

  let starterIdx = state.deck.findIndex((c) => !isWild(c))
  if (starterIdx === -1) {
    state.deck.push(...shuffle(createDeck().filter((c) => !isWild(c))))
    starterIdx = state.deck.findIndex((c) => !isWild(c))
  }
  const starter = state.deck.splice(starterIdx, 1)[0]

  state.discard = [starter]
  state.currentColor = colorOf(starter)

  if (isActionCard(starter)) {
    const kind = kindOf(starter)
    if (kind === 'skip') {
      state.turnIndex = nextIndex(state.turnIndex, state.turnOrder.length, state.direction)
    } else if (kind === 'reverse') {
      state.direction = -1
      if (state.turnOrder.length > 2) {
        state.turnIndex = nextIndex(state.turnIndex, state.turnOrder.length, state.direction)
      }
    } else if (kind === 'draw2') {
      const first = state.turnOrder[state.turnIndex]
      state.hands[first] = [...state.hands[first], ...drawCards(state, 2)]
      state.turnIndex = nextIndex(state.turnIndex, state.turnOrder.length, state.direction)
    }
  }

  return state
}

export function playCard(state, playerId, cardId, chosenColor) {
  if (state.winnerId) return state
  if (state.turnOrder[state.turnIndex] !== playerId) return state
  const hand = state.hands[playerId]
  if (!hand || !hand.includes(cardId)) return state

  const top = state.discard[state.discard.length - 1]
  const playable =
    isWild(cardId) ||
    colorOf(cardId) === state.currentColor ||
    kindOf(cardId) === kindOf(top) ||
    (!isWild(top) && colorOf(cardId) === colorOf(top))
  if (!playable) return state

  const next = {
    ...state,
    hands: { ...state.hands, [playerId]: removeOne(hand, cardId) },
    discard: [...state.discard, cardId],
  }

  if (isWild(cardId)) {
    next.currentColor = COLORS.includes(chosenColor) ? chosenColor : COLORS[0]
  } else {
    next.currentColor = colorOf(cardId)
  }

  if (next.hands[playerId].length === 0) {
    next.winnerId = playerId
    next.turnId = crypto.randomUUID()
    next.lastAction = { type: 'win', by: playerId, card: cardId }
    return next
  }

  const kind = kindOf(cardId)
  let steps = 1
  if (kind === 'skip') {
    steps = 2
  } else if (kind === 'reverse') {
    next.direction = next.direction * -1
    steps = next.turnOrder.length === 2 ? 2 : 1
  } else if (kind === 'draw2') {
    const victimIdx = nextIndex(next.turnIndex, next.turnOrder.length, next.direction)
    const victim = next.turnOrder[victimIdx]
    next.hands[victim] = [...next.hands[victim], ...drawCards(next, 2)]
    steps = 2
  } else if (kind === 'wild4') {
    const victimIdx = nextIndex(next.turnIndex, next.turnOrder.length, next.direction)
    const victim = next.turnOrder[victimIdx]
    next.hands[victim] = [...next.hands[victim], ...drawCards(next, 4)]
    steps = 2
  }

  for (let i = 0; i < steps; i++) {
    next.turnIndex = nextIndex(next.turnIndex, next.turnOrder.length, next.direction)
  }
  next.turnId = crypto.randomUUID()
  next.lastAction = { type: 'play', by: playerId, card: cardId, color: next.currentColor }
  return next
}

export function drawCardForPlayer(state, playerId) {
  if (state.winnerId) return state
  if (state.turnOrder[state.turnIndex] !== playerId) return state

  const next = { ...state, hands: { ...state.hands } }
  next.hands[playerId] = [...next.hands[playerId], ...drawCards(next, 1)]
  next.turnIndex = nextIndex(next.turnIndex, next.turnOrder.length, next.direction)
  next.turnId = crypto.randomUUID()
  next.lastAction = { type: 'draw', by: playerId }
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
