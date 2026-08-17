import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

const AuthContext = createContext(null)

const HEARTBEAT_MS = 45000

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const heartbeatRef = useRef(null)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile(data)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      loadProfile(data.session?.user?.id).finally(() => setLoading(false))
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      loadProfile(newSession?.user?.id)
    })

    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  useEffect(() => {
    if (!session?.user?.id) return

    const beat = () => {
      supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', session.user.id).then(() => {})
    }
    beat()
    heartbeatRef.current = setInterval(beat, HEARTBEAT_MS)
    return () => clearInterval(heartbeatRef.current)
  }, [session?.user?.id])

  async function signUpWithEmail({ email, password, username, displayName }) {
    const { data: existing } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle()
    if (existing) throw new Error('اسم المستخدم مستخدم من قبل')

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username, display_name: displayName || username } },
    })
    if (error) throw error
  }

  async function signInWithIdentifier({ identifier, password }) {
    let email = identifier
    if (!identifier.includes('@')) {
      const { data, error } = await supabase.rpc('get_email_for_username', { uname: identifier })
      if (error || !data) throw new Error('اسم المستخدم غير موجود')
      email = data
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error('البريد/اسم المستخدم أو كلمة المرور غير صحيحة')
  }

  async function signInWithPhoneOtp({ phone }) {
    const { error } = await supabase.auth.signInWithOtp({ phone })
    if (error) throw error
  }

  async function verifyPhoneOtp({ phone, token }) {
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function refreshProfile() {
    await loadProfile(session?.user?.id)
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        signUpWithEmail,
        signInWithIdentifier,
        signInWithPhoneOtp,
        verifyPhoneOtp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
