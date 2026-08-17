import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/auth'
import Avatar from '../components/ui/Avatar'
import Card from '../components/ui/Card'

const TABS = [
  { key: 'today', label: 'اليوم' },
  { key: 'week', label: 'هذا الأسبوع' },
  { key: 'month', label: 'هذا الشهر' },
  { key: 'all', label: 'كل الوقت' },
]

const MEDALS = ['🥇', '🥈', '🥉']

function rangeStart(tab) {
  const now = new Date()
  if (tab === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  }
  if (tab === 'week') {
    const d = new Date(now)
    d.setDate(d.getDate() - 7)
    return d.toISOString()
  }
  if (tab === 'month') {
    const d = new Date(now)
    d.setMonth(d.getMonth() - 1)
    return d.toISOString()
  }
  return null
}

export default function Leaderboard() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('all')
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let cancelled = false
    setRows(null)

    async function load() {
      if (tab === 'all') {
        const { data } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, total_points')
          .order('total_points', { ascending: false })
          .limit(50)
        if (!cancelled) setRows((data || []).map((p) => ({ id: p.id, name: p.display_name, avatarUrl: p.avatar_url, points: p.total_points })))
        return
      }

      const since = rangeStart(tab)
      const { data } = await supabase
        .from('game_results')
        .select('user_id, score, profiles(display_name, avatar_url)')
        .gte('created_at', since)

      if (cancelled) return
      const totals = {}
      for (const r of data || []) {
        if (!totals[r.user_id]) {
          totals[r.user_id] = { id: r.user_id, name: r.profiles?.display_name || '؟', avatarUrl: r.profiles?.avatar_url, points: 0 }
        }
        totals[r.user_id].points += r.score
      }
      setRows(Object.values(totals).sort((a, b) => b.points - a.points).slice(0, 50))
    }

    load()
    return () => {
      cancelled = true
    }
  }, [tab])

  return (
    <div className="flex flex-col gap-6 pb-6">
      <h1 className="text-2xl font-black">🏆 المتصدرون</h1>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-4 py-2 rounded-pill text-sm font-bold transition-colors ${
              tab === t.key ? 'bg-primary text-primary-ink' : 'bg-surface-2 text-ink-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="p-3">
        {rows === null ? (
          <div className="py-10 flex justify-center">
            <div className="w-6 h-6 rounded-full border-4 border-primary-soft border-t-primary animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center text-ink-muted py-10">ما فيه نتائج بهالفترة بعد</p>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {rows.map((r, i) => (
              <div
                key={r.id}
                className={`flex items-center gap-3 px-2 py-3 ${r.id === profile?.id ? 'bg-primary-soft rounded-btn' : ''}`}
              >
                <span className="w-7 text-center font-black">{MEDALS[i] || i + 1}</span>
                <Avatar name={r.name} src={r.avatarUrl} size="sm" />
                <span className="font-bold flex-1 truncate">{r.name}</span>
                <span className="font-black text-primary">{r.points.toLocaleString('en-US')}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
