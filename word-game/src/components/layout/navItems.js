import { Home, Gamepad2, Trophy, User } from 'lucide-react'

export const NAV_ITEMS = [
  { to: '/', label: 'الرئيسية', icon: Home, end: true },
  { to: '/games', label: 'الألعاب', icon: Gamepad2 },
  { to: '/leaderboard', label: 'الترتيب', icon: Trophy },
  { to: '/profile', label: 'حسابي', icon: User },
]
