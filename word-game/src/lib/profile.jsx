import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

const ProfileContext = createContext(null)
const STORAGE_KEY = 'jamatna_guest_id'
const HEARTBEAT_MS = 45000

function getOrCreateGuestId() {
  let id = localStorage.getItem(STORAGE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, id)
  }
  return id
}

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const heartbeatRef = useRef(null)

  const loadProfile = useCallback(async () => {
    const id = getOrCreateGuestId()
    const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
    setProfile(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  useEffect(() => {
    if (!profile?.id) return
    const beat = () => {
      supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', profile.id).then(() => {})
    }
    beat()
    heartbeatRef.current = setInterval(beat, HEARTBEAT_MS)
    return () => clearInterval(heartbeatRef.current)
  }, [profile?.id])

  async function createProfile({ displayName }) {
    const id = getOrCreateGuestId()
    const username = 'guest_' + id.replace(/-/g, '').slice(0, 10)
    const display_name = displayName.trim()

    const { error: insertError } = await supabase.from('profiles').insert({ id, username, display_name })
    // 23505 = unique_violation: this guest id already has a row (e.g. retry after a slow/blocked response)
    if (insertError && insertError.code !== '23505') throw insertError

    const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
    const row =
      data || {
        id,
        username,
        display_name,
        avatar_url: null,
        total_points: 0,
        games_played: 0,
        wins: 0,
        best_score: 0,
        level: 1,
      }
    setProfile(row)
    return row
  }

  async function updateProfile(fields) {
    const { data, error } = await supabase.from('profiles').update(fields).eq('id', profile.id).select().single()
    if (error) throw error
    setProfile(data)
    return data
  }

  function resetProfile() {
    localStorage.removeItem(STORAGE_KEY)
    setProfile(null)
  }

  return (
    <ProfileContext.Provider value={{ profile, loading, createProfile, updateProfile, resetProfile }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  return useContext(ProfileContext)
}
