import { motion } from 'framer-motion'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  text?: string
}

export function LoadingSpinner({ size = 'md', text }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  }

  const petalCount = 8

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className={`relative ${sizeClasses[size]}`}>
        {Array.from({ length: petalCount }).map((_, i) => (
          <motion.span
            key={i}
            className="absolute left-1/2 top-0 -translate-x-1/2 origin-bottom"
            style={{
              width: size === 'sm' ? '3px' : size === 'lg' ? '6px' : size === 'xl' ? '8px' : '4px',
              height: size === 'sm' ? '12px' : size === 'lg' ? '30px' : size === 'xl' ? '40px' : '20px',
              background: 'linear-gradient(to bottom, rgba(147, 197, 253, 0.8), rgba(244, 114, 182, 0.8))',
              borderRadius: '9999px',
              transform: `rotate(${(i / petalCount) * 360}deg) translateY(${size === 'sm' ? '8px' : size === 'lg' ? '20px' : size === 'xl' ? '28px' : '14px'})`,
              transformOrigin: 'center bottom',
            }}
            animate={{
              opacity: [0.3, 1, 0.3],
            }}
            transition={{
              duration: 1.6,
              repeat: Infinity,
              delay: i * (1.6 / petalCount),
              ease: 'easeInOut',
            }}
          />
        ))}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <span style={{ fontSize: size === 'sm' ? '10px' : size === 'lg' ? '20px' : size === 'xl' ? '24px' : '14px' }}>
            🌸
          </span>
        </motion.div>
      </div>
      {text && (
        <motion.p
          className="text-white/70 text-sm"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {text}
        </motion.p>
      )}
    </div>
  )
}
