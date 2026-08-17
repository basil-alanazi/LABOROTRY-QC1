const sizes = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-16 h-16 text-lg',
  xl: 'w-24 h-24 text-2xl',
}

const palette = [
  'bg-primary-soft text-primary',
  'bg-accent-soft text-accent',
  'bg-success-soft text-success',
  'bg-warning-soft text-warning',
]

function colorFor(seed) {
  let hash = 0
  for (const ch of seed || '?') hash = (hash * 31 + ch.charCodeAt(0)) % palette.length
  return palette[hash]
}

export default function Avatar({ src, name = '', size = 'md', online, className = '' }) {
  const initial = name.trim().charAt(0) || '؟'

  return (
    <div className={`relative shrink-0 ${sizes[size]} ${className}`}>
      {src ? (
        <img src={src} alt={name} className="w-full h-full rounded-full object-cover" />
      ) : (
        <div
          className={`w-full h-full rounded-full flex items-center justify-center font-bold ${colorFor(name)}`}
        >
          {initial}
        </div>
      )}
      {online !== undefined && (
        <span
          className={`absolute bottom-0 left-0 w-1/3 h-1/3 rounded-full border-2 border-surface ${
            online ? 'bg-success' : 'bg-ink-muted'
          }`}
        />
      )}
    </div>
  )
}
