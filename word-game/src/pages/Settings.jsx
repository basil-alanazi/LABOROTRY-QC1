import { useState } from 'react'
import { Moon, Sun, RotateCcw } from 'lucide-react'
import { useProfile } from '../lib/profile'
import { useTheme } from '../lib/theme'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import Avatar from '../components/ui/Avatar'

export default function Settings() {
  const { profile, updateProfile, resetProfile } = useProfile()
  const { theme, toggleTheme } = useTheme()
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave(e) {
    e.preventDefault()
    if (!displayName.trim()) return
    setSaving(true)
    try {
      await updateProfile({ display_name: displayName.trim() })
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    if (!confirm('بيصير اسمك ونتائجك على هالجهاز غير مرتبطة فيك بعدها. متأكد؟')) return
    resetProfile()
  }

  if (!profile) return null

  return (
    <div className="flex flex-col gap-6 pb-6">
      <h1 className="font-display font-bold text-2xl">⚙️ الإعدادات</h1>

      <Card className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={displayName} size="lg" />
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <Input label="الاسم الظاهر" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <Button type="submit" disabled={saving || !displayName.trim()}>
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
          onClick={handleReset}
          className="w-full flex items-center gap-3 px-3.5 py-3.5 rounded-btn font-bold text-danger hover:bg-danger-soft transition-colors"
        >
          <RotateCcw size={20} />
          ابدأ من جديد (يمسح اسمك من الجهاز)
        </button>
      </Card>
    </div>
  )
}
