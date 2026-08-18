import { Moon, Sun } from 'lucide-react'
import BrandMark from '../BrandMark'
import { useTheme } from '../../lib/theme'

export default function MobileTopBar() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="md:hidden flex items-center justify-between px-4 pt-4">
      <div className="w-9" />
      <BrandMark size="sm" />
      <button
        type="button"
        aria-label="تبديل الوضع الداكن/الفاتح"
        onClick={toggleTheme}
        className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center text-ink-muted"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </div>
  )
}
