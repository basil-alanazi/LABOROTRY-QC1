const sizes = {
  sm: { img: 'w-8 h-8', ar: 'text-sm', en: 'text-[0.55rem]' },
  md: { img: 'w-12 h-12', ar: 'text-lg', en: 'text-[0.65rem]' },
  lg: { img: 'w-20 h-20', ar: 'text-2xl', en: 'text-xs' },
}

export default function BrandMark({ size = 'md', stacked = false, className = '' }) {
  const s = sizes[size]

  return (
    <div className={`flex ${stacked ? 'flex-col' : 'flex-row'} items-center gap-2 ${className}`}>
      <img src="/brand/mark-192.png" alt="جمعتنا" className={`${s.img} rounded-full object-cover shrink-0`} />
      <div className={`flex flex-col ${stacked ? 'items-center' : 'items-start'} leading-tight`}>
        <span className={`font-display font-bold text-ink ${s.ar}`}>جمعتنا</span>
        <span className={`${s.en} font-bold text-ink-muted tracking-[0.2em]`}>JAMAATNA</span>
      </div>
    </div>
  )
}
