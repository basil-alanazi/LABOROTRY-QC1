import { useState } from 'react'
import Home from './pages/Home'
import Room from './pages/Room'
import { getOrCreatePlayerId } from './utils/gameLogic'

const playerId = getOrCreatePlayerId()

export default function App() {
  const [room, setRoom] = useState(null) // {code, name}

  if (!room) {
    return <Home onEnterRoom={(code, name) => setRoom({ code, name })} />
  }

  return (
    <Room
      roomCode={room.code}
      playerId={playerId}
      playerName={room.name}
      onLeave={() => setRoom(null)}
    />
  )
}
