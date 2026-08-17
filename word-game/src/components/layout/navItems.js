import { Home, Gamepad2, Users, Trophy, User } from 'lucide-react'

export const NAV_ITEMS = [
  { to: '/', label: 'الرئيسية', icon: Home, end: true },
  { to: '/games', label: 'الألعاب', icon: Gamepad2 },
  { to: '/friends', label: 'جماعتنا', icon: Users },
  { to: '/leaderboard', label: 'الترتيب', icon: Trophy },
  { to: '/profile', label: 'حسابي', icon: User },
]
