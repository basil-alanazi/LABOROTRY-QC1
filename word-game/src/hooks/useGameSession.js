import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { getGame } from '../games/registry'

const RESULT_PAUSE_MS = 2600
const RECENT_MEMORY = 8

export function useGameSession(code, profile) {
  const [sessionRow, setSessionRow] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [players, setPlayers] = useState({}) // id -> {name, avatarUrl}
  const [scores, setScores] = useState({})
  const [status, setStatus] = useState('lobby') // lobby | playing | finished
  const [config, setConfig] = useState({ rounds: 10, roundSeconds: 25, language: 'mixed' })
  const [round, setRound] = useState(null)
  const [roundPhase, setRoundPhase] = useState('playing') // playing | result
  const [resultInfo, setResultInfo] = useState(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [finalResults, setFinalResults] = useState(null)

  const channelRef = useRef(null)
  const isHostRef = useRef(false)
  const scoresRef = useRef({})
  const recentKeysRef = useRef([])
  const resolvedRoundRef = useRef(null)
  const timeoutTimerRef = useRef(null)
  const nextRoundTimerRef = useRef(null)
  const gameModuleRef = useRef(null)
  const persistedRef = useRef(false)

  useEffect(() => {
    scoresRef.current = scores
  }, [scores])

  // تحميل الجلسة من قاعدة البيانات
  useEffect(() => {
    let cancelled = false
    supabase
      .from('game_sessions')
      .select('*')
      .eq('code', code)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (!data) {
          setNotFound(true)
          return
        }
        setSessionRow(data)
        setStatus(data.status)
        setConfig({ rounds: data.rounds, roundSeconds: data.round_seconds, language: data.word_language || 'mixed' })
        gameModuleRef.current = getGame(data.game_id)
      })
    return () => {
      cancelled = true
    }
  }, [code])

  const startRound = useCallback(
    (index) => {
      const gm = gameModuleRef.current
      const key = gm.pickRoundKey(recentKeysRef.current, config.language)
      recentKeysRef.current = [key, ...recentKeysRef.current].slice(0, RECENT_MEMORY)
      const data = gm.getRoundData(key, config.language)
      const roundId = crypto.randomUUID()
      const endsAt = Date.now() + config.roundSeconds * 1000
      resolvedRoundRef.current = null
      channelRef.current?.send({
        type: 'broadcast',
        event: 'round-start',
        payload: { roundIndex: index, roundId, key, data, endsAt },
      })
    },
    [config.roundSeconds, config.language]
  )

  const finishGame = useCallback((finalScores) => {
    const ranked = Object.entries(players)
      .map(([id, p]) => ({ id, name: p.name, avatarUrl: p.avatarUrl, score: finalScores[id] || 0 }))
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ ...p, rank: i + 1 }))

    channelRef.current?.send({
      type: 'broadcast',
      event: 'game-finished',
      payload: { finalScores, ranked },
    })

    supabase
      .from('game_sessions')
      .update({ status: 'finished', finished_at: new Date().toISOString() })
      .eq('id', sessionRow.id)
      .then(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, sessionRow])

  // الاتصال بقناة الجلسة اللحظية
  useEffect(() => {
    if (!sessionRow || !profile) return

    supabase
      .from('session_players')
      .upsert(
        { session_id: sessionRow.id, user_id: profile.id, score: 0 },
        { onConflict: 'session_id,user_id', ignoreDuplicates: true }
      )
      .then(() => {})

    const channel = supabase.channel(`session-${code}`, {
      config: { broadcast: { self: true }, presence: { key: profile.id } },
    })
    channelRef.current = channel
    isHostRef.current = sessionRow.host_id === profile.id

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const map = {}
        for (const key in state) {
          const entry = state[key][0]
          if (entry) map[key] = entry
        }
        setPlayers(map)
      })
      .on('broadcast', { event: 'config-update' }, ({ payload }) => {
        setConfig(payload)
      })
      .on('broadcast', { event: 'game-start' }, ({ payload }) => {
        setConfig(payload)
        setStatus('playing')
        setScores({})
        setFinalResults(null)
        if (isHostRef.current) {
          setTimeout(() => startRound(1), 400)
        }
      })
      .on('broadcast', { event: 'round-start' }, ({ payload }) => {
        setRound(payload)
        setRoundPhase('playing')
        setResultInfo(null)

        if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current)
        if (isHostRef.current) {
          const gm = gameModuleRef.current
          timeoutTimerRef.current = setTimeout(() => {
            if (resolvedRoundRef.current === payload.roundId) return
            resolvedRoundRef.current = payload.roundId
            channel.send({
              type: 'broadcast',
              event: 'round-result',
              payload: {
                roundId: payload.roundId,
                roundIndex: payload.roundIndex,
                winnerId: null,
                winnerName: null,
                word: gm.revealAnswer(payload.key, config.language),
                scores: scoresRef.current,
              },
            })
          }, config.roundSeconds * 1000 + 250)
        }
      })
      .on('broadcast', { event: 'round-result' }, ({ payload }) => {
        setRoundPhase('result')
        setResultInfo({ ...payload, isMe: payload.winnerId === profile.id })
        setScores(payload.scores)
        if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current)

        if (isHostRef.current) {
          if (nextRoundTimerRef.current) clearTimeout(nextRoundTimerRef.current)
          nextRoundTimerRef.current = setTimeout(() => {
            if (payload.roundIndex >= config.rounds) {
              finishGame(payload.scores)
            } else {
              startRound(payload.roundIndex + 1)
            }
          }, RESULT_PAUSE_MS)
        }
      })
      .on('broadcast', { event: 'guess' }, ({ payload }) => {
        if (!isHostRef.current) return
        if (resolvedRoundRef.current === payload.roundId) return
        resolvedRoundRef.current = payload.roundId
        const newScores = {
          ...scoresRef.current,
          [payload.playerId]: (scoresRef.current[payload.playerId] || 0) + 100,
        }
        setScores(newScores)
        channel.send({
          type: 'broadcast',
          event: 'round-result',
          payload: {
            roundId: payload.roundId,
            roundIndex: payload.roundIndex,
            winnerId: payload.playerId,
            winnerName: payload.playerName,
            word: payload.word,
            scores: newScores,
          },
        })
      })
      .on('broadcast', { event: 'game-finished' }, ({ payload }) => {
        setStatus('finished')
        setFinalResults(payload.ranked)
      })
      .subscribe(async (subStatus) => {
        if (subStatus === 'SUBSCRIBED') {
          await channel.track({
            name: profile.display_name,
            avatarUrl: profile.avatar_url,
          })
        }
      })

    return () => {
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current)
      if (nextRoundTimerRef.current) clearTimeout(nextRoundTimerRef.current)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionRow?.id, profile?.id, code])

  // عداد الوقت
  useEffect(() => {
    if (roundPhase !== 'playing' || !round) return
    const tick = () => setTimeLeft(Math.max(0, Math.ceil((round.endsAt - Date.now()) / 1000)))
    tick()
    const interval = setInterval(tick, 250)
    return () => clearInterval(interval)
  }, [roundPhase, round])

  // حفظ النتيجة النهائية في قاعدة البيانات (مرة وحدة لكل جلسة)
  useEffect(() => {
    if (status !== 'finished' || !finalResults || !profile || !sessionRow || persistedRef.current) return
    persistedRef.current = true

    const mine = finalResults.find((p) => p.id === profile.id)
    const myScore = mine?.score || 0
    const myRank = mine?.rank || null
    const won = myRank === 1

    supabase
      .from('game_results')
      .insert({
        session_id: sessionRow.id,
        user_id: profile.id,
        game_id: sessionRow.game_id,
        score: myScore,
        rank: myRank,
      })
      .then(() => {})

    supabase
      .from('profiles')
      .select('total_points, games_played, wins, best_score, level')
      .eq('id', profile.id)
      .single()
      .then(({ data }) => {
        if (!data) return
        const total_points = data.total_points + myScore
        supabase
          .from('profiles')
          .update({
            total_points,
            games_played: data.games_played + 1,
            wins: data.wins + (won ? 1 : 0),
            best_score: Math.max(data.best_score, myScore),
            level: Math.floor(total_points / 1000) + 1,
          })
          .eq('id', profile.id)
          .then(() => {})
      })
  }, [status, finalResults, profile, sessionRow])

  function updateConfig(next) {
    setConfig(next)
    channelRef.current?.send({ type: 'broadcast', event: 'config-update', payload: next })
  }

  function startGame() {
    if (!isHostRef.current) return
    supabase
      .from('game_sessions')
      .update({
        status: 'playing',
        rounds: config.rounds,
        round_seconds: config.roundSeconds,
        word_language: config.language,
        started_at: new Date().toISOString(),
      })
      .eq('id', sessionRow.id)
      .then(() => {})
    channelRef.current?.send({ type: 'broadcast', event: 'game-start', payload: config })
  }

  function submitGuess(guessText) {
    const gm = gameModuleRef.current
    if (!round || !gm.checkAnswer(round.key, guessText, config.language)) return false
    channelRef.current?.send({
      type: 'broadcast',
      event: 'guess',
      payload: {
        roundId: round.roundId,
        roundIndex: round.roundIndex,
        playerId: profile.id,
        playerName: profile.display_name,
        word: gm.revealAnswer(round.key, config.language),
      },
    })
    return true
  }

  return {
    sessionRow,
    notFound,
    gameModule: gameModuleRef.current,
    players,
    scores,
    status,
    config,
    isHost: isHostRef.current,
    round,
    roundPhase,
    resultInfo,
    timeLeft,
    finalResults,
    updateConfig,
    startGame,
    submitGuess,
  }
}
