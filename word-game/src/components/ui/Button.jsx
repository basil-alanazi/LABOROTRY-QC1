import { motion } from 'framer-motion'

const variants = {
  primary: 'bg-primary text-primary-ink hover:bg-primary-hover',
  accent: 'bg-accent text-accent-ink hover:bg-accent-hover',
  soft: 'bg-primary-soft text-primary hover:opacity-80',
  ghost: 'bg-surface-2 text-ink hover:bg-line',
  outline: 'bg-transparent text-ink border border-line hover:bg-surface-2',
  danger: 'bg-danger-soft text-danger hover:opacity-80',
}

const sizes = {
  sm: 'text-sm px-3 py-2',
  md: 'text-[0.95rem] px-4 py-3',
  lg: 'text-base px-6 py-4',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  full = false,
  disabled = false,
  className = '',
  children,
  ...props
}) {
  return (
    <motion.button
      whileTap={disabled ? {} : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-btn font-bold transition-colors disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${sizes[size]} ${full ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  )
}
