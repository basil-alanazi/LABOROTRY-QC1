import { useState } from 'react'
import { Moon, Sun, LogOut } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { supabase } from '../lib/supabaseClient'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import Avatar from '../components/ui/Avatar'

export default function Settings() {
  const { profile, user, signOut, refreshProfile } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await supabase
        .from('profiles')
        .update({ display_name: displayName, avatar_url: avatarUrl || null })
        .eq('id', profile.id)
      await refreshProfile()
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } finally {
      setSaving(false)
    }
  }

  if (!profile) return null

  return (
    <div className="flex flex-col gap-6 pb-6">
      <h1 className="text-2xl font-black">⚙️ الإعدادات</h1>

      <Card className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={displayName} src={avatarUrl} size="lg" />
          <div>
            <p className="font-bold">@{profile.username}</p>
            <p className="text-xs text-ink-muted">{user?.email || user?.phone}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <Input label="الاسم الظاهر" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <Input
            label="رابط الصورة الشخصية (اختياري)"
            dir="ltr"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://..."
          />
          <Button type="submit" disabled={saving}>
            {saving ? 'جارٍ الحفظ...' : saved ? '✓ تم الحفظ' : 'حفظ التغييرات'}
          </Button>
        </form>
      </Card>

      <Card className="p-2">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3.5 py-3.5 rounded-btn font-bold hover:bg-surface-2 transition-colors"
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          {theme === 'dark' ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الداكن'}
        </button>
      </Card>

      <Card className="p-2">
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3.5 py-3.5 rounded-btn font-bold text-danger hover:bg-danger-soft transition-colors"
        >
          <LogOut size={20} />
          تسجيل الخروج
        </button>
      </Card>
    </div>
  )
}
