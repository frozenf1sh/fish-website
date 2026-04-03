import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LoadingSpinner } from './LoadingSpinner'
import { compressImage } from '../utils/imageCompressor'
import { clients } from '../lib/connect'
import { useStore } from '../store/useStore'

interface PostComposerProps {
  onPostCreated?: () => void
}

interface UploadedImage {
  id: string
  url: string
  isUploading: boolean
}

const COMMON_EMOJIS = ['😀', '😂', '🥺', '😍', '🥰', '😎', '😭', '😊', '🤔', '🤔', '👍', '🙏', '❤️', '🔥', '✨', '🎉', '🌸', '👀', '💩', '💀']

export function PostComposer({ onPostCreated }: PostComposerProps) {
  const [content, setContent] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedImages, setSelectedImages] = useState<UploadedImage[]>([])
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const { settings } = useStore()
  const avatarUrl = settings?.avatarUrl

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // clear input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    const newImages = files.map(file => {
      const tempId = `temp-${Date.now()}-${Math.random()}`
      return { file, tempId }
    })

    setSelectedImages(prev => [
      ...prev,
      ...newImages.map(img => ({ id: img.tempId, url: URL.createObjectURL(img.file), isUploading: true }))
    ])

    for (const { file, tempId } of newImages) {
      try {
        const compressedFile = await compressImage(file)
        
        const reqRes = await clients.album.uploadImageRequest({
          fileName: compressedFile.name,
          mimeType: compressedFile.type,
          fileSize: compressedFile.size,
          albumId: 'default'
        })

        const headers: Record<string, string> = typeof reqRes.headers === 'object' ? { ...reqRes.headers } : {}
        if (compressedFile.type && !headers['Content-Type']) {
            headers['Content-Type'] = compressedFile.type
        }
        await fetch(reqRes.uploadUrl, {
          method: 'PUT',
          body: compressedFile,
          headers,
        })

        const confRes = await clients.album.confirmImageUpload({
          imageId: reqRes.imageId,
          uploadUrl: reqRes.uploadUrl,
        })
        
        if (confRes.image) {
          setSelectedImages(prev => prev.map(img => 
            img.id === tempId ? { id: confRes.image!.id, url: confRes.image!.url, isUploading: false } : img
          ))
        }
      } catch (err) {
        console.error('Failed to upload image:', err)
        setSelectedImages(prev => prev.filter(img => img.id !== tempId)) // remove failed uploads
      }
    }
  }

  const handleRemoveImage = (idToRemove: string) => {
    setSelectedImages(prev => prev.filter(img => img.id !== idToRemove))
  }

  const handleEmojiSelect = (emoji: string) => {
    setContent(prev => prev + emoji)
    setShowEmojiPicker(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim() && selectedImages.length === 0) return
    // Prevent submitting if any image is still uploading
    if (selectedImages.some(img => img.isUploading)) return

    setIsSubmitting(true)

    try {
      await clients.post.createPost({
        content: content,
        imageIds: selectedImages.map(img => img.id),
      })
      setContent('')
      setSelectedImages([])
      onPostCreated?.()
    } catch (err) {
      console.error('Failed to create post:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="glass-panel rounded-4xl p-6 mb-6"
    >
      <form onSubmit={handleSubmit}>
        <div className="flex gap-4">
          {avatarUrl ? (
            <div className="w-12 h-12 rounded-full overflow-hidden border border-white/20 shadow-lg flex-shrink-0">
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400 flex items-center justify-center text-white text-xl shadow-lg flex-shrink-0">
              🌸
            </div>
          )}
          <div className="flex-1">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="在想些什么呢？"
              className="w-full bg-transparent text-white/90 placeholder-white/40 resize-none outline-none text-lg leading-relaxed min-h-[80px]"
              rows={3}
              disabled={isSubmitting}
            />

            {selectedImages.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-4">
                {selectedImages.map((img) => (
                  <div
                    key={img.id}
                    className="relative aspect-square rounded-2xl overflow-hidden border border-white/20 flex items-center justify-center bg-black/10"
                  >
                    <img 
                      src={img.url} 
                      alt="Selected preview" 
                      className={`w-full h-full object-cover transition-opacity ${img.isUploading ? 'opacity-50' : 'opacity-100'}`}
                    />
                    {img.isUploading && (
                      <div className="absolute inset-0 flex items-center justify-center">
                         <LoadingSpinner size="sm" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(img.id)}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full text-white/90 flex items-center justify-center hover:bg-red-500/80 transition-colors"
                      title="移除图片"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/20">
              <div className="flex gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={isSubmitting}
                  onChange={handleImageSelect}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting}
                  className="p-2 rounded-2xl hover:bg-white/20 text-white/70 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  title="添加图片"
                >
                  📷
                </button>
                <div className="relative">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className={`p-2 rounded-2xl hover:bg-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${showEmojiPicker ? 'text-white bg-white/10' : 'text-white/70 hover:text-white'}`}
                    title="表情"
                  >
                    😊
                  </button>
                  
                  <AnimatePresence>
                    {showEmojiPicker && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute left-0 bottom-12 p-3 bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl w-64 z-50 grid grid-cols-5 gap-2"
                      >
                        {COMMON_EMOJIS.map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleEmojiSelect(emoji)}
                            className="text-2xl hover:scale-125 transition-transform flex items-center justify-center p-1 rounded-xl hover:bg-white/10"
                          >
                            {emoji}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || (!content.trim() && selectedImages.length === 0) || selectedImages.some(img => img.isUploading)}
                className="btn-primary px-6 py-2.5 rounded-2xl text-white font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <LoadingSpinner size="sm" text="发布中..." />
                ) : (
                  <>
                    <span>发布</span>
                    <span>✈️</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    </motion.div>
  )
}
