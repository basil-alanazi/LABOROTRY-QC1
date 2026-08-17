import { motion, AnimatePresence } from 'framer-motion'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import Card from '../ui/Card'

const ROUND_OPTIONS = [5, 10, 15, 20]
const TIME_OPTIONS = [15, 25, 35]

export default function SessionLobby({ code, gameModule, players, myId, isHost, config, updateConfig, startGame }) {
  const [copied, setCopied] = useState(false)
  const playerList = Object.entries(players).map(([id, p]) => ({ id, ...p }))

  function copyCode() {
    navigator.clipboard?.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

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
        <p className="text-sm text-ink-muted">شارك الرمز مع جماعتك للانضمام</p>
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
          <Button variant="accent" size="lg" full onClick={startGame}>
            🚀 ابدأ اللعبة
          </Button>
        </Card>
      ) : (
        <p className="text-center text-ink-muted font-bold">بانتظار المضيف يبدأ اللعبة...</p>
      )}
    </div>
  )
}
