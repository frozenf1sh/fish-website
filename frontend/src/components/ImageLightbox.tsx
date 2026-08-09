import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

interface ImageLightboxProps {
  src: string | null
  alt?: string
  onClose: () => void
}

export function ImageLightbox({ src, alt = '放大图片', onClose }: ImageLightboxProps) {
  useEffect(() => {
    if (!src) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, src])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8 bg-black/88 backdrop-blur-md cursor-zoom-out"
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
          onClick={(event) => {
            // This portal still bubbles through the React tree to PostCard.
            // Stop that propagation so closing the preview never navigates to
            // the post detail page as a side effect.
            event.stopPropagation()
            onClose()
          }}
        >
          <motion.img
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            src={src}
            alt={alt}
            className="max-w-[96vw] max-h-[92vh] object-contain rounded-2xl shadow-2xl cursor-default"
            onClick={(event) => event.stopPropagation()}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
