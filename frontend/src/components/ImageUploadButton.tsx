import { useRef, useState } from 'react'
import { compressImage } from '../utils/imageCompressor'
import { clients } from '../lib/connect'

interface UploadedImage {
  id: string
  url: string
  thumbnailUrl?: string
  fileName: string
}

interface ImageUploadButtonProps {
  onUploaded: (image: UploadedImage) => void
  disabled?: boolean
  label?: string
}

export function ImageUploadButton({ onUploaded, disabled = false, label = '上传图片' }: ImageUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setIsUploading(true)
    try {
      const compressed = await compressImage(file)
      const request = await clients.album.uploadImageRequest({
        albumId: 'default',
        fileName: compressed.name,
        mimeType: compressed.type,
        fileSize: compressed.size,
      })
      const headers: Record<string, string> = typeof request.headers === 'object' ? { ...request.headers } : {}
      if (compressed.type && !headers['Content-Type']) headers['Content-Type'] = compressed.type
      const response = await fetch(request.uploadUrl, { method: 'PUT', body: compressed, headers })
      if (!response.ok) throw new Error(`image upload failed: ${response.status}`)
      const confirmed = await clients.album.confirmImageUpload({ imageId: request.imageId, uploadUrl: request.uploadUrl })
      if (confirmed.image) {
        onUploaded({
          id: confirmed.image.id,
          url: confirmed.image.url,
          thumbnailUrl: confirmed.image.thumbnailUrl,
          fileName: confirmed.image.fileName,
        })
      }
    } catch (error) {
      console.error('Failed to upload image:', error)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" disabled={disabled || isUploading} onChange={handleChange} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || isUploading}
        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white/85 transition-colors hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span aria-hidden="true">📷</span>
        {isUploading ? '上传中…' : label}
      </button>
    </>
  )
}
