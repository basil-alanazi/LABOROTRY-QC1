import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/auth'
import { createSession } from '../lib/createSession'
import Avatar from '../components/ui/Avatar'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

const ONLINE_WINDOW_MS = 2 * 60 * 1000

function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS
}

export default function Friends() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [friends, setFriends] = useState(null)
  const [username, setUsername] = useState('')
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  async function loadFriends() {
    const { data } = await supabase
      .from('friendships')
      .select('friend_id, profiles!friendships_friend_id_fkey(id, display_name, avatar_url, last_seen_at, username)')
      .eq('user_id', profile.id)

    setFriends(
      (data || [])
        .map((row) => row.profiles)
        .filter(Boolean)
        .sort((a, b) => isOnline(b.last_seen_at) - isOnline(a.last_seen_at))
    )
  }

  useEffect(() => {
    if (profile) loadFriends()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  async function handleAddFriend(e) {
    e.preventDefault()
    setAddError('')
    if (!username.trim()) return
    setAdding(true)
    try {
      const { data: target } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('username', username.trim())
        .maybeSingle()

      if (!target) {
        setAddError('ما لقينا هذا المستخدم')
        return
      }
      if (target.id === profile.id) {
        setAddError('ما تقدر تضيف نفسك 😅')
        return
      }

      await supabase.from('friendships').upsert(
        [
          { user_id: profile.id, friend_id: target.id },
          { user_id: target.id, friend_id: profile.id },
        ],
        { onConflict: 'user_id,friend_id', ignoreDuplicates: true }
      )

      setUsername('')
      loadFriends()
    } finally {
      setAdding(false)
    }
  }

  async function startSessionWith() {
    const session = await createSession('reversed-words', profile.id)
    navigate(`/session/${session.code}`)
  }

  const onlineFriends = (friends || []).filter((f) => isOnline(f.last_seen_at))

  return (
    <div className="flex flex-col gap-6 pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">👥 جماعتنا</h1>
        <Button size="sm" variant="soft" onClick={startSessionWith}>
          + ابدأ جلسة
        </Button>
      </div>

      <Card className="p-4">
        <form onSubmit={handleAddFriend} className="flex gap-2">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="أضف صديق باسم المستخدم"
            dir="ltr"
          />
          <Button type="submit" variant="soft" disabled={adding}>
            <UserPlus size={18} />
          </Button>
        </form>
        {addError && <p className="text-danger text-sm mt-2">{addError}</p>}
      </Card>

      <div>
        <h2 className="font-black text-lg mb-3">الموجودين الآن ({onlineFriends.length})</h2>
        {friends === null ? (
          <div className="py-8 flex justify-center">
            <div className="w-6 h-6 rounded-full border-4 border-primary-soft border-t-primary animate-spin" />
          </div>
        ) : friends.length === 0 ? (
          <p className="text-ink-muted text-center py-8">ما ضفت أحد بعد — دور أصحابك باسم المستخدم 👆</p>
        ) : (
          <Card className="p-3 flex flex-col divide-y divide-line">
            {friends.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-2 py-3">
                <Avatar name={f.display_name} src={f.avatar_url} size="sm" online={isOnline(f.last_seen_at)} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate">{f.display_name}</p>
                  <p className="text-xs text-ink-muted">@{f.username}</p>
                </div>
                <span className={`text-xs font-bold ${isOnline(f.last_seen_at) ? 'text-success' : 'text-ink-muted'}`}>
                  {isOnline(f.last_seen_at) ? 'متصل' : 'غير متصل'}
                </span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}
