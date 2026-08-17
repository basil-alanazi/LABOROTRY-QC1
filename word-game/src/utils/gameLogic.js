export const ROUND_SECONDS = 25
export const RESULT_PAUSE_MS = 3000
export const RECENT_WORDS_MEMORY = 8

export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export function getOrCreatePlayerId() {
  const key = 'maqlouba_player_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

export function getSavedName() {
  return localStorage.getItem('maqlouba_player_name') || ''
}

export function saveName(name) {
  localStorage.setItem('maqlouba_player_name', name)
}

// يحدد المضيف (host) بأقدم لاعب انضم حسب presence
export function electHost(presenceState) {
  let host = null
  for (const key in presenceState) {
    const entries = presenceState[key]
    for (const entry of entries) {
      if (!host || entry.joinedAt < host.joinedAt) {
        host = entry
      }
    }
  }
  return host
}
