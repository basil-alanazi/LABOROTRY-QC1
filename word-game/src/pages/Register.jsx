import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../lib/auth'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'

export default function Register() {
  const { signUpWithEmail } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ displayName: '', username: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(form.username)) {
      setError('اسم المستخدم يكون بالإنجليزي/أرقام فقط، من 3 إلى 20 حرف')
      return
    }
    if (form.password.length < 6) {
      setError('كلمة المرور لازم 6 أحرف على الأقل')
      return
    }

    setLoading(true)
    try {
      await signUpWithEmail({
        email: form.email,
        password: form.password,
        username: form.username,
        displayName: form.displayName,
      })
      setDone(true)
    } catch (err) {
      setError(err.message || 'صار خطأ، حاول مرة ثانية')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas px-5 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="text-5xl mb-3">📩</div>
          <h1 className="text-xl font-black mb-2">تحقق من بريدك</h1>
          <p className="text-ink-muted mb-6">أرسلنا رابط تأكيد إلى {form.email}</p>
          <Link to="/login" className="text-primary font-bold">
            رجوع لتسجيل الدخول
          </Link>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">🎉</div>
          <h1 className="text-2xl font-black">انضم لـ جمعتنا</h1>
          <p className="text-ink-muted font-bold text-sm">اللعبة تجمعنا</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="اسمك"
            value={form.displayName}
            onChange={(e) => update('displayName', e.target.value)}
            placeholder="باسل"
            required
          />
          <Input
            label="اسم المستخدم"
            dir="ltr"
            value={form.username}
            onChange={(e) => update('username', e.target.value)}
            placeholder="basil"
            required
          />
          <Input
            label="البريد الإلكتروني"
            type="email"
            dir="ltr"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            placeholder="you@example.com"
            required
          />
          <Input
            label="كلمة المرور"
            type="password"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            placeholder="••••••••"
            required
          />
          {error && <p className="text-danger text-sm text-center">{error}</p>}
          <Button type="submit" size="lg" full disabled={loading}>
            {loading ? 'جارٍ الإنشاء...' : 'إنشاء حساب'}
          </Button>
        </form>

        <p className="text-center text-sm text-ink-muted mt-6">
          عندك حساب؟{' '}
          <Link to="/login" className="text-primary font-bold">
            سجّل الدخول
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
