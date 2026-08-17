import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../lib/auth'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import BrandMark from '../components/BrandMark'

export default function Login() {
  const { signInWithIdentifier, signInWithPhoneOtp, verifyPhoneOtp } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('password') // password | phone
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handlePasswordLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signInWithIdentifier({ identifier, password })
      navigate('/')
    } catch (err) {
      setError(err.message || 'صار خطأ، حاول مرة ثانية')
    } finally {
      setLoading(false)
    }
  }

  async function handleSendOtp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signInWithPhoneOtp({ phone })
      setOtpSent(true)
    } catch (err) {
      setError(err.message || 'ما قدرنا نرسل الرمز — تأكد إن تسجيل الدخول بالجوال مفعّل')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await verifyPhoneOtp({ phone, token: otp })
      navigate('/')
    } catch (err) {
      setError(err.message || 'رمز غير صحيح')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="flex flex-col items-center gap-2 mb-8">
          <BrandMark size="lg" stacked />
          <p className="text-ink-muted font-bold text-sm">اللعبة تجمعنا</p>
        </div>

        <div className="flex bg-surface-2 rounded-btn p-1 mb-6">
          <button
            onClick={() => setMode('password')}
            className={`flex-1 py-2 rounded-[10px] text-sm font-bold transition-colors ${
              mode === 'password' ? 'bg-surface shadow-soft text-ink' : 'text-ink-muted'
            }`}
          >
            بريد / يوزر
          </button>
          <button
            onClick={() => setMode('phone')}
            className={`flex-1 py-2 rounded-[10px] text-sm font-bold transition-colors ${
              mode === 'phone' ? 'bg-surface shadow-soft text-ink' : 'text-ink-muted'
            }`}
          >
            دخول سريع بالجوال
          </button>
        </div>

        {mode === 'password' ? (
          <form onSubmit={handlePasswordLogin} className="flex flex-col gap-4">
            <Input
              label="البريد الإلكتروني أو اسم المستخدم"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@example.com أو username"
              required
            />
            <Input
              label="كلمة المرور"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            {error && <p className="text-danger text-sm text-center">{error}</p>}
            <Button type="submit" size="lg" full disabled={loading}>
              {loading ? 'جارٍ الدخول...' : 'تسجيل الدخول'}
            </Button>
          </form>
        ) : !otpSent ? (
          <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
            <Input
              label="رقم الجوال"
              type="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+9665xxxxxxxx"
              required
            />
            {error && <p className="text-danger text-sm text-center">{error}</p>}
            <Button type="submit" size="lg" full disabled={loading}>
              {loading ? 'جارٍ الإرسال...' : 'إرسال رمز التحقق'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
            <Input
              label={`أدخل الرمز المرسل إلى ${phone}`}
              dir="ltr"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
              required
            />
            {error && <p className="text-danger text-sm text-center">{error}</p>}
            <Button type="submit" size="lg" full disabled={loading}>
              {loading ? 'جارٍ التحقق...' : 'تأكيد'}
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-ink-muted mt-6">
          ما عندك حساب؟{' '}
          <Link to="/register" className="text-primary font-bold">
            سجّل الآن
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
