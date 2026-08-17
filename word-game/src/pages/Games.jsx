import GamesGrid from '../components/GamesGrid'

export default function Games() {
  return (
    <div className="flex flex-col gap-6 pb-6">
      <h1 className="font-display font-bold text-2xl">🎮 الألعاب</h1>
      <GamesGrid title={null} />
    </div>
  )
}
