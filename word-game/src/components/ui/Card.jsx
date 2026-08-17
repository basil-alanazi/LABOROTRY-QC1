import { motion } from 'framer-motion'

export default function Card({ hover = false, className = '', children, ...props }) {
  return (
    <motion.div
      whileHover={hover ? { y: -3, boxShadow: 'var(--shadow-pop)' } : undefined}
      whileTap={hover ? { scale: 0.98 } : undefined}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={`bg-surface border border-line rounded-card shadow-card ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  )
}
