import { useState } from 'react'
import { generateRoomCode, getSavedName, saveName } from '../utils/gameLogic'

export default function Home({ onEnterRoom }) {
  const [name, setName] = useState(getSavedName())
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')

  function handleCreate() {
    if (!name.trim()) return setError('اكتب اسمك أول')
    saveName(name.trim())
    onEnterRoom(generateRoomCode(), name.trim())
  }

  function handleJoin() {
    if (!name.trim()) return setError('اكتب اسمك أول')
    if (!joinCode.trim()) return setError('اكتب كود الغرفة')
    saveName(name.trim())
    onEnterRoom(joinCode.trim().toUpperCase(), name.trim())
  }

  return (
    <div className="screen home">
      <div className="card">
        <h1 className="title">🔀 مقلوبة</h1>
        <p className="subtitle">لعبة كلمات معكوسة — أول واحد يحلها ياخذ النقطة</p>

        <label className="field-label">اسمك</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="اكتب اسمك"
          maxLength={20}
        />

        {error && <div className="error">{error}</div>}

        <button className="btn btn-primary" onClick={handleCreate}>
          إنشاء غرفة جديدة
        </button>

        <div className="divider">أو</div>

        <label className="field-label">كود غرفة موجودة</label>
        <div className="join-row">
          <input
            className="input"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="مثال: A7K2M"
            maxLength={5}
            style={{ textTransform: 'uppercase', letterSpacing: '2px' }}
          />
          <button className="btn btn-secondary" onClick={handleJoin}>
            انضمام
          </button>
        </div>
      </div>
    </div>
  )
}
