import { useState } from 'react'
import { motion } from 'framer-motion'
import { useProfile } from '../lib/profile'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import BrandMark from '../components/BrandMark'

export default function Onboarding() {
  const { createProfile } = useProfile()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    setLoading(true)
    try {
      await createProfile({ displayName: name })
    } catch (err) {
      const msg = err?.message || ''
      if (/load failed|fetch|network|failed to fetch/i.test(msg)) {
        setError('تعذر الاتصال بالخادم. تأكد من اتصال الإنترنت وحاول مرة ثانية')
      } else {
        setError(msg || 'صار خطأ، حاول مرة ثانية')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-5 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-8">
          <BrandMark size="lg" stacked />
          <p className="text-ink-muted font-bold text-sm">اللعبة تجمعنا — بدون تسجيل، بس اسمك وتلعب</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="وش اسمك؟"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلاً: باسل"
            maxLength={20}
            autoFocus
            required
          />
          {error && <p className="text-danger text-sm text-center">{error}</p>}
          <Button type="submit" size="lg" full disabled={loading || !name.trim()}>
            {loading ? 'جارٍ التجهيز...' : 'يلا نبدأ 🎉'}
          </Button>
        </form>
      </motion.div>
    </div>
  )
}
