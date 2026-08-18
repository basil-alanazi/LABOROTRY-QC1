export function pickTarget() {
  return Math.round(Math.random() * 2000 + 400) / 100 // 4.00 - 24.00
}

export function createInitialState(playerIds) {
  return {
    activePlayers: [...playerIds],
    turnIndex: 0,
    target: pickTarget(),
    baseValue: 0,
    startedAt: Date.now(),
    roundId: crypto.randomUUID(),
    turnToken: crypto.randomUUID(),
    winnerId: null,
    eliminatedOrder: [],
    lastEvent: { type: 'start' },
  }
}

export function elapsedNow(state) {
  return state.baseValue + (Date.now() - state.startedAt) / 1000
}

export function processStop(state, playerId) {
  if (state.winnerId) return state
  if (state.activePlayers[state.turnIndex] !== playerId) return state

  const elapsed = elapsedNow(state)
  if (elapsed >= state.target) {
    return processBust(state, playerId, elapsed)
  }

  return {
    ...state,
    baseValue: elapsed,
    startedAt: Date.now(),
    turnIndex: (state.turnIndex + 1) % state.activePlayers.length,
    turnToken: crypto.randomUUID(),
    lastEvent: { type: 'success', playerId, stoppedAt: elapsed },
  }
}

export function processBust(state, playerId, elapsedOverride) {
  if (state.winnerId) return state
  const bustedIdx = state.activePlayers.indexOf(playerId)
  if (bustedIdx === -1) return state

  const elapsed = elapsedOverride ?? elapsedNow(state)
  const remaining = state.activePlayers.filter((id) => id !== playerId)
  const eliminatedOrder = [...state.eliminatedOrder, playerId]

  if (remaining.length <= 1) {
    return {
      ...state,
      activePlayers: remaining,
      eliminatedOrder,
      turnToken: crypto.randomUUID(),
      winnerId: remaining[0] || null,
      lastEvent: { type: 'bust', playerId, stoppedAt: elapsed },
    }
  }

  return {
    activePlayers: remaining,
    turnIndex: bustedIdx % remaining.length,
    target: pickTarget(),
    baseValue: 0,
    startedAt: Date.now(),
    roundId: crypto.randomUUID(),
    turnToken: crypto.randomUUID(),
    winnerId: null,
    eliminatedOrder,
    lastEvent: { type: 'bust', playerId, stoppedAt: elapsed },
  }
}

export function computeFinalScores(state, allPlayerIds) {
  const ranking = [state.winnerId, ...[...state.eliminatedOrder].reverse()].filter(Boolean)
  const scores = {}
  ranking.forEach((id, i) => {
    scores[id] = Math.max(300 - i * 50, 0)
  })
  for (const id of allPlayerIds) {
    if (!(id in scores)) scores[id] = 0
  }
  return scores
}
