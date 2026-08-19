import { motion, AnimatePresence } from 'framer-motion'
import { Check, Copy, Share2 } from 'lucide-react'
import { useState } from 'react'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import Card from '../ui/Card'

const ROUND_OPTIONS = [5, 10, 15, 20]
const TIME_OPTIONS = [15, 25, 35]
const LANGUAGE_OPTIONS = [
  { key: 'ar', label: 'عربي' },
  { key: 'en', label: 'English' },
  { key: 'mixed', label: 'خليط' },
]

export default function SessionLobby({ code, gameModule, players, myId, isHost, config, updateConfig, startGame }) {
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const playerList = Object.entries(players).map(([id, p]) => ({ id, ...p }))
  const teams = config.teams || {}
  const inviteUrl = `${window.location.origin}/session/${code}`

  function copyCode() {
    navigator.clipboard?.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function shareInvite() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: gameModule.name,
          text: `تعال العب ${gameModule.name} وياي على جمعتنا!`,
          url: inviteUrl,
        })
        return
      } catch {
        // المستخدم ألغى المشاركة أو ما تدعمها — نكمل بنسخ الرابط
      }
    }
    navigator.clipboard?.writeText(inviteUrl)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 1500)
  }

  function cycleTeam(playerId) {
    const current = teams[playerId] || null
    const next = current === null ? 'A' : current === 'A' ? 'B' : null
    const nextTeams = { ...teams }
    if (next === null) delete nextTeams[playerId]
    else nextTeams[playerId] = next
    updateConfig({ ...config, teams: nextTeams })
  }

  const teamACount = playerList.filter((p) => teams[p.id] === 'A').length
  const teamBCount = playerList.filter((p) => teams[p.id] === 'B').length
  const teamsValid =
    playerList.length > 0 &&
    playerList.every((p) => teams[p.id]) &&
    teamACount >= 2 &&
    teamBCount >= 2

  return (
    <div className="flex flex-col gap-6 pb-6">
      <div className="text-center flex flex-col items-center gap-2 pt-2">
        <span className="text-4xl">{gameModule.icon}</span>
        <h1 className="text-xl font-black">{gameModule.name}</h1>
        <button
          onClick={copyCode}
          className="flex items-center gap-2 bg-primary-soft text-primary font-black text-lg rounded-pill px-5 py-2 tracking-[0.3em]"
        >
          {code}
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
        <button
          onClick={shareInvite}
          className="flex items-center gap-2 bg-accent text-accent-ink font-bold text-sm rounded-pill px-4 py-2"
        >
          {linkCopied ? <Check size={15} /> : <Share2 size={15} />}
          {linkCopied ? 'انتسخ الرابط ✅' : 'أرسل رابط الدعوة'}
        </button>
        <p className="text-sm text-ink-muted">اللي يفتح الرابط يدخل الجلسة على طول، بدون ما يسجل شي</p>
      </div>

      <Card className="p-5">
        <h2 className="font-bold text-sm text-ink-muted mb-3">
          الموجودين الحين ({playerList.length})
        </h2>
        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {playerList.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3"
              >
                <Avatar name={p.name} src={p.avatarUrl} size="sm" online />
                <span className="font-bold">{p.name}</span>
                {p.id === myId && <span className="text-xs text-ink-muted">(أنت)</span>}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </Card>

      {isHost ? (
        <Card className="p-5 flex flex-col gap-5">
          {!gameModule.hideRoundConfig && (
            <>
              <div>
                <p className="font-bold text-sm text-ink-muted mb-2">عدد الجولات</p>
                <div className="flex gap-2">
                  {ROUND_OPTIONS.map((n) => (
                    <button
                      key={n}
                      onClick={() => updateConfig({ ...config, rounds: n })}
                      className={`flex-1 py-2.5 rounded-btn font-black transition-colors ${
                        config.rounds === n ? 'bg-primary text-primary-ink' : 'bg-surface-2 text-ink-muted'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-bold text-sm text-ink-muted mb-2">وقت كل جولة</p>
                <div className="flex gap-2">
                  {TIME_OPTIONS.map((n) => (
                    <button
                      key={n}
                      onClick={() => updateConfig({ ...config, roundSeconds: n })}
                      className={`flex-1 py-2.5 rounded-btn font-black transition-colors ${
                        config.roundSeconds === n ? 'bg-primary text-primary-ink' : 'bg-surface-2 text-ink-muted'
                      }`}
                    >
                      {n}ث
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {gameModule.hasLanguageOption && (
            <div>
              <p className="font-bold text-sm text-ink-muted mb-2">{gameModule.languageLabel || 'لغة الكلمات'}</p>
              <div className="flex gap-2">
                {(gameModule.languageOptions || LANGUAGE_OPTIONS).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => updateConfig({ ...config, language: opt.key })}
                    className={`flex-1 py-2.5 rounded-btn font-black transition-colors ${
                      config.language === opt.key ? 'bg-primary text-primary-ink' : 'bg-surface-2 text-ink-muted'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {gameModule.hasTeams && (
            <div>
              <p className="font-bold text-sm text-ink-muted mb-2">وزّع الفرق (اضغط على أي لاعب يبدل فريقه)</p>
              <div className="flex flex-col gap-2">
                {playerList.map((p) => {
                  const team = teams[p.id] || null
                  return (
                    <button
                      key={p.id}
                      onClick={() => cycleTeam(p.id)}
                      className={`flex items-center gap-3 rounded-btn px-3 py-2.5 border-2 transition-colors ${
                        team === 'A'
                          ? 'border-primary bg-primary-soft'
                          : team === 'B'
                            ? 'border-accent bg-accent-soft'
                            : 'border-line bg-surface'
                      }`}
                    >
                      <Avatar name={p.name} src={p.avatarUrl} size="sm" />
                      <span className="font-bold flex-1 text-start">{p.name}</span>
                      <span className="text-xs font-black">
                        {team === 'A' ? 'فريق أ' : team === 'B' ? 'فريق ب' : 'بدون فريق'}
                      </span>
                    </button>
                  )
                })}
              </div>
              {!teamsValid && (
                <p className="text-danger text-xs mt-2">
                  لازم كل لاعب يكون بفريق، وكل فريق فيه لاعبين على الأقل
                </p>
              )}
            </div>
          )}
          <Button variant="accent" size="lg" full onClick={startGame} disabled={gameModule.hasTeams && !teamsValid}>
            🚀 ابدأ اللعبة
          </Button>
        </Card>
      ) : (
        <p className="text-center text-ink-muted font-bold">بانتظار المضيف يبدأ اللعبة...</p>
      )}
    </div>
  )
}
