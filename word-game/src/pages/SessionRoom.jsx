import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useGameSession } from '../hooks/useGameSession'
import SessionLobby from '../components/session/SessionLobby'
import SessionResults from '../components/session/SessionResults'

export default function SessionRoom() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const session = useGameSession(code, profile)

  if (session.notFound) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <p className="text-4xl">🤔</p>
        <p className="font-bold text-lg">ما لقينا جلسة بهذا الرمز</p>
        <button onClick={() => navigate('/games')} className="text-primary font-bold">
          رجوع للألعاب
        </button>
      </div>
    )
  }

  if (!session.sessionRow || !session.gameModule || !profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-4 border-primary-soft border-t-primary animate-spin" />
      </div>
    )
  }

  if (session.status === 'lobby') {
    return (
      <SessionLobby
        code={code}
        gameModule={session.gameModule}
        players={session.players}
        myId={profile.id}
        isHost={session.isHost}
        config={session.config}
        updateConfig={session.updateConfig}
        startGame={session.startGame}
      />
    )
  }

  if (session.status === 'playing') {
    const GameScreen = session.gameModule.GameScreen
    if (!session.round) {
      return (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 rounded-full border-4 border-primary-soft border-t-primary animate-spin" />
        </div>
      )
    }
    return (
      <GameScreen
        roundIndex={session.round.roundIndex}
        totalRounds={session.config.rounds}
        timeLeft={session.timeLeft}
        totalTime={session.config.roundSeconds}
        roundData={session.round.data}
        phase={session.roundPhase}
        resultInfo={session.resultInfo}
        onSubmitGuess={session.submitGuess}
        onExit={() => navigate('/games')}
      />
    )
  }

  if (session.status === 'finished' && session.finalResults) {
    return (
      <SessionResults
        gameId={session.sessionRow.game_id}
        results={session.finalResults}
        myId={profile.id}
        currentUserId={profile.id}
      />
    )
  }

  return null
}
