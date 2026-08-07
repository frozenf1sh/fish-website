import { useState } from 'react'
import { MediaPickerDialog, type MediaAsset } from './MediaPickerDialog'

interface ImageUploadButtonProps {
  onUploaded: (image: MediaAsset) => void
  disabled?: boolean
  label?: string
}

export function ImageUploadButton({ onUploaded, disabled = false, label = '上传图片' }: ImageUploadButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white/85 transition-colors hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span aria-hidden="true">📷</span>
        {label}
      </button>
      <MediaPickerDialog
        open={open}
        multiple={false}
        title={label}
        onClose={() => setOpen(false)}
        onConfirm={(images) => {
          const image = images[0]
          if (image) onUploaded(image)
        }}
      />
    </>
  )
}
