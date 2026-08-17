import { NavLink } from 'react-router-dom'
import { Moon, Sun, LogOut, Settings } from 'lucide-react'
import { NAV_ITEMS } from './navItems'
import Avatar from '../ui/Avatar'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../lib/theme'

export default function Sidebar() {
  const { profile, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()

  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 h-screen sticky top-0 border-s border-line bg-surface px-4 py-6">
      <div className="flex items-center gap-2 px-2 mb-8">
        <span className="text-2xl">🎉</span>
        <span className="font-black text-lg">جمعتنا</span>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-3 rounded-btn font-bold transition-colors ${
                isActive ? 'bg-primary-soft text-primary' : 'text-ink-muted hover:bg-surface-2'
              }`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-2 pt-4 border-t border-line">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3.5 py-2.5 rounded-btn font-bold text-sm transition-colors ${
              isActive ? 'bg-primary-soft text-primary' : 'text-ink-muted hover:bg-surface-2'
            }`
          }
        >
          <Settings size={18} />
          الإعدادات
        </NavLink>

        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-btn font-bold text-sm text-ink-muted hover:bg-surface-2 transition-colors"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
        </button>

        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-btn font-bold text-sm text-danger hover:bg-danger-soft transition-colors"
        >
          <LogOut size={18} />
          تسجيل الخروج
        </button>

        {profile && (
          <NavLink to="/profile" className="flex items-center gap-3 px-2 py-2 mt-2">
            <Avatar name={profile.display_name} src={profile.avatar_url} size="sm" />
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">{profile.display_name}</p>
              <p className="text-xs text-ink-muted">المستوى {profile.level}</p>
            </div>
          </NavLink>
        )}
      </div>
    </aside>
  )
}
