import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { WORDS, isArabic, scramble, normalize, pickWord } from '../words'
import {
  ROUND_SECONDS,
  RESULT_PAUSE_MS,
  RECENT_WORDS_MEMORY,
  electHost,
} from '../utils/gameLogic'

export default function Room({ roomCode, playerId, playerName, onLeave }) {
  const [players, setPlayers] = useState({}) // id -> {name, joinedAt}
  const [scores, setScores] = useState({}) // id -> number
  const [isHost, setIsHost] = useState(false)
  const [round, setRound] = useState(null) // {roundId, wordId, scrambled, endsAt}
  const [phase, setPhase] = useState('waiting') // waiting | playing | result
  const [resultInfo, setResultInfo] = useState(null)
  const [guess, setGuess] = useState('')
  const [wrongFlash, setWrongFlash] = useState(false)
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS)
  const [copied, setCopied] = useState(false)

  const channelRef = useRef(null)
  const resolvedRoundRef = useRef(null) // roundId already resolved by host
  const recentWordsRef = useRef([])
  const nextRoundTimerRef = useRef(null)
  const timeoutTimerRef = useRef(null)
  const isHostRef = useRef(false)
  const scoresRef = useRef({})

  useEffect(() => {
    isHostRef.current = isHost
  }, [isHost])
  useEffect(() => {
    scoresRef.current = scores
  }, [scores])

  const startNextRound = useCallback(() => {
    const { id, word } = pickWord(recentWordsRef.current)
    recentWordsRef.current = [id, ...recentWordsRef.current].slice(0, RECENT_WORDS_MEMORY)
    const roundId = crypto.randomUUID()
    const endsAt = Date.now() + ROUND_SECONDS * 1000
    resolvedRoundRef.current = null
    channelRef.current?.send({
      type: 'broadcast',
      event: 'round-start',
      payload: { roundId, wordId: id, scrambled: scramble(word), endsAt },
    })
  }, [])

  useEffect(() => {
    const channel = supabase.channel(`word-game-room-${roomCode}`, {
      config: { broadcast: { self: true }, presence: { key: playerId } },
    })
    channelRef.current = channel

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const map = {}
        for (const key in state) {
          const entry = state[key][0]
          if (entry) map[key] = entry
        }
        setPlayers(map)
        const host = electHost(state)
        setIsHost(host?.id === playerId)
      })
      .on('broadcast', { event: 'round-start' }, ({ payload }) => {
        setRound(payload)
        setPhase('playing')
        setResultInfo(null)
        setGuess('')
        setWrongFlash(false)

        if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current)
        if (isHostRef.current) {
          timeoutTimerRef.current = setTimeout(() => {
            if (resolvedRoundRef.current === payload.roundId) return
            resolvedRoundRef.current = payload.roundId
            channel.send({
              type: 'broadcast',
              event: 'round-result',
              payload: {
                roundId: payload.roundId,
                winnerId: null,
                winnerName: null,
                word: WORDS[payload.wordId],
                scores: scoresRef.current,
              },
            })
          }, ROUND_SECONDS * 1000 + 200)
        }
      })
      .on('broadcast', { event: 'round-result' }, ({ payload }) => {
        setPhase('result')
        setResultInfo(payload)
        setScores(payload.scores)
        if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current)
        if (isHostRef.current) {
          if (nextRoundTimerRef.current) clearTimeout(nextRoundTimerRef.current)
          nextRoundTimerRef.current = setTimeout(startNextRound, RESULT_PAUSE_MS)
        }
      })
      .on('broadcast', { event: 'guess' }, ({ payload }) => {
        if (!isHostRef.current) return
        if (resolvedRoundRef.current === payload.roundId) return
        resolvedRoundRef.current = payload.roundId
        const newScores = { ...scoresRef.current, [payload.playerId]: (scoresRef.current[payload.playerId] || 0) + 1 }
        setScores(newScores)
        channel.send({
          type: 'broadcast',
          event: 'round-result',
          payload: {
            roundId: payload.roundId,
            winnerId: payload.playerId,
            winnerName: payload.playerName,
            word: payload.word,
            scores: newScores,
          },
        })
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ id: playerId, name: playerName, joinedAt: Date.now() })
        }
      })

    return () => {
      if (nextRoundTimerRef.current) clearTimeout(nextRoundTimerRef.current)
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, playerId, playerName])

  // المضيف يبدأ أول جولة إذا ما فيه جولة شغالة
  useEffect(() => {
    if (isHost && !round && phase === 'waiting') {
      const t = setTimeout(startNextRound, 600)
      return () => clearTimeout(t)
    }
  }, [isHost, round, phase, startNextRound])

  // عداد الوقت
  useEffect(() => {
    if (phase !== 'playing' || !round) return
    const tick = () => {
      const left = Math.max(0, Math.ceil((round.endsAt - Date.now()) / 1000))
      setTimeLeft(left)
    }
    tick()
    const interval = setInterval(tick, 250)
    return () => clearInterval(interval)
  }, [phase, round])

  function submitGuess(e) {
    e.preventDefault()
    if (phase !== 'playing' || !round || !guess.trim()) return
    const correct = normalize(guess) === normalize(WORDS[round.wordId])
    if (correct) {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'guess',
        payload: {
          roundId: round.roundId,
          playerId,
          playerName,
          word: WORDS[round.wordId],
        },
      })
      setGuess('')
    } else {
      setWrongFlash(true)
      setTimeout(() => setWrongFlash(false), 400)
    }
  }

  function copyCode() {
    navigator.clipboard?.writeText(roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const sortedPlayers = Object.entries(players)
    .map(([id, p]) => ({ id, name: p.name, score: scores[id] || 0 }))
    .sort((a, b) => b.score - a.score)

  const scrambledWord = round?.scrambled || ''
  const wordIsArabic = isArabic(scrambledWord)

  return (
    <div className="screen room">
      <header className="room-header">
        <button className="btn-link" onClick={onLeave}>
          ← خروج
        </button>
        <button className="room-code" onClick={copyCode} title="انسخ الكود">
          {roomCode} {copied ? '✓' : '⧉'}
        </button>
      </header>

      <div className="room-body">
        <div className="game-area">
          {phase === 'waiting' && <div className="status-msg">جارٍ تجهيز أول جولة...</div>}

          {phase === 'playing' && round && (
            <>
              <div className="timer-bar">
                <div
                  className="timer-fill"
                  style={{ width: `${(timeLeft / ROUND_SECONDS) * 100}%` }}
                />
              </div>
              <div className="timer-num">{timeLeft}s</div>
              <div className={`scrambled-word ${wordIsArabic ? 'rtl' : 'ltr'}`}>
                {scrambledWord}
              </div>
              <form onSubmit={submitGuess} className={`guess-form ${wrongFlash ? 'shake' : ''}`}>
                <input
                  className="input guess-input"
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  placeholder="اكتب الكلمة الصحيحة"
                  autoFocus
                  dir={wordIsArabic ? 'rtl' : 'ltr'}
                />
                <button className="btn btn-primary" type="submit">
                  إرسال
                </button>
              </form>
            </>
          )}

          {phase === 'result' && resultInfo && (
            <div className="result-box">
              {resultInfo.winnerId ? (
                <div className="result-win">
                  🎉 {resultInfo.winnerId === playerId ? 'أنت' : resultInfo.winnerName} جاوب صح!
                </div>
              ) : (
                <div className="result-timeout">⏱️ خلص الوقت! ما حد جاوب</div>
              )}
              <div className="result-word">
                الكلمة: <b>{resultInfo.word}</b>
              </div>
              <div className="status-msg">الجولة الجاية بعد شوي...</div>
            </div>
          )}
        </div>

        <aside className="scoreboard">
          <h3>اللاعبين ({sortedPlayers.length})</h3>
          <ul>
            {sortedPlayers.map((p, i) => (
              <li key={p.id} className={p.id === playerId ? 'me' : ''}>
                <span className="rank">{i + 1}</span>
                <span className="pname">{p.name}</span>
                <span className="pscore">{p.score}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}
