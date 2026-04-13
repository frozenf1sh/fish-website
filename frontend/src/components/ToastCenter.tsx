import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ToastPayload, ToastType } from '../lib/toast'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

const typeClassMap: Record<ToastType, string> = {
  success: 'bg-emerald-500/95 text-white border-emerald-300/60',
  error: 'bg-rose-500/95 text-white border-rose-300/60',
  info: 'bg-sky-500/95 text-white border-sky-300/60',
  warning: 'bg-amber-500/95 text-white border-amber-200/60',
}

export function ToastCenter() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const onToast = (evt: Event) => {
      const custom = evt as CustomEvent<ToastPayload>
      const message = custom.detail?.message?.trim()
      if (!message) return
      const type = custom.detail?.type || 'info'

      const id = Date.now() + Math.floor(Math.random() * 1000)
      setToasts((prev) => [...prev, { id, message, type }])
      setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id))
      }, 2400)
    }

    window.addEventListener('app:toast', onToast)
    return () => window.removeEventListener('app:toast', onToast)
  }, [])

  return (
    <div className="fixed right-3 bottom-20 sm:right-6 sm:bottom-6 z-[120] space-y-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            className={`px-4 py-2.5 rounded-2xl border shadow-2xl backdrop-blur ${typeClassMap[item.type]} max-w-[78vw] sm:max-w-sm`}
          >
            <p className="text-sm font-medium leading-5">{item.message}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
