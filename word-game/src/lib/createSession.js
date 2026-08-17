import { supabase } from './supabaseClient'
import { generateSessionCode } from './sessionCode'
import { getGame } from '../games/registry'

export async function createSession(gameId, hostId) {
  const gm = getGame(gameId)
  const code = generateSessionCode()

  const { data, error } = await supabase
    .from('game_sessions')
    .insert({
      code,
      game_id: gameId,
      host_id: hostId,
      rounds: gm.defaultRounds,
      round_seconds: gm.defaultSeconds,
      status: 'lobby',
    })
    .select()
    .single()

  if (error) throw error
  return data
}
