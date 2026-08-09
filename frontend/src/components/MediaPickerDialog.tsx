import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { clients } from '../lib/connect'
import { compressImage } from '../utils/imageCompressor'
import type { Album, AlbumImage } from '../shared/domain/content'

export type MediaAsset = AlbumImage

type MediaTab = 'album' | 'upload' | 'paste'
type UploadStatus = 'queued' | 'compressing' | 'uploading' | 'confirming' | 'success' | 'error'

interface UploadTask {
  id: string
  fileName: string
  progress: number
  status: UploadStatus
  error?: string
  asset?: MediaAsset
}

interface MediaPickerDialogProps {
  open: boolean
  multiple?: boolean
  title?: string
  initialAlbumId?: string
  onUploaded?: (asset: MediaAsset) => void
  onClose: () => void
  onConfirm: (assets: MediaAsset[]) => void
}

const statusLabel: Record<UploadStatus, string> = {
  queued: '等待中',
  compressing: '压缩中',
  uploading: '上传中',
  confirming: '确认中',
  success: '已完成',
  error: '失败',
}

const uploadFileWithProgress = (url: string, file: File, headers: Record<string, string>, onProgress: (value: number) => void) => new Promise<void>((resolve, reject) => {
  const request = new XMLHttpRequest()
  request.open('PUT', url)
  Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value))
  request.upload.onprogress = (event) => {
    if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
  }
  request.onload = () => {
    if (request.status >= 200 && request.status < 300) resolve()
    else reject(new Error(`upload failed: ${request.status}`))
  }
  request.onerror = () => reject(new Error('network error'))
  request.send(file)
})

export function MediaPickerDialog({ open, multiple = true, title = '选择图片', initialAlbumId, onUploaded, onClose, onConfirm }: MediaPickerDialogProps) {
  const [tab, setTab] = useState<MediaTab>('album')
  const [albums, setAlbums] = useState<Album[]>([])
  const [albumId, setAlbumId] = useState('')
  const [images, setImages] = useState<MediaAsset[]>([])
  const [selected, setSelected] = useState<MediaAsset[]>([])
  const [tasks, setTasks] = useState<UploadTask[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setTab('album')
    setSelected([])
    setTasks([])
    const load = async () => {
      setIsLoading(true)
      try {
        const response = await clients.album.listAlbums({ pageSize: 100, onlyPublic: false })
        const nextAlbums = (response.albums || []) as Album[]
        setAlbums(nextAlbums)
        setAlbumId((current) => initialAlbumId || current || nextAlbums.find((item) => item.id === 'default')?.id || nextAlbums[0]?.id || '')
      } catch (error) {
        console.error('Failed to load albums:', error)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [open, initialAlbumId])

  useEffect(() => {
    if (!open || !albumId) return
    const load = async () => {
      setIsLoading(true)
      try {
        const response = await clients.album.getAlbum({ albumId })
        setImages((response.images || []) as MediaAsset[])
      } catch (error) {
        console.error('Failed to load album images:', error)
        setImages([])
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [open, albumId])

  const toggleSelected = (asset: MediaAsset) => {
    setSelected((current) => {
      const exists = current.some((item) => item.id === asset.id)
      if (exists) return current.filter((item) => item.id !== asset.id)
      return multiple ? [...current, asset] : [asset]
    })
  }

  const updateTask = (id: string, patch: Partial<UploadTask>) => {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, ...patch } : task))
  }

  const uploadFile = async (file: File) => {
    const taskId = `${Date.now()}-${Math.random()}`
    setTasks((current) => [...current, { id: taskId, fileName: file.name, progress: 0, status: 'queued' }])
    try {
      updateTask(taskId, { status: 'compressing' })
      const compressed = await compressImage(file)
      const request = await clients.album.uploadImageRequest({
        albumId: albumId || 'default',
        fileName: compressed.name,
        mimeType: compressed.type,
        fileSize: compressed.size,
      })
      const headers: Record<string, string> = typeof request.headers === 'object' ? { ...request.headers } : {}
      if (compressed.type && !headers['Content-Type']) headers['Content-Type'] = compressed.type
      updateTask(taskId, { status: 'uploading' })
      await uploadFileWithProgress(request.uploadUrl, compressed, headers, (progress) => updateTask(taskId, { progress }))
      updateTask(taskId, { status: 'confirming', progress: 100 })
      const confirmed = await clients.album.confirmImageUpload({ imageId: request.imageId, uploadUrl: request.uploadUrl })
      if (!confirmed.image) throw new Error('upload confirmation failed')
      const asset = confirmed.image as MediaAsset
      updateTask(taskId, { status: 'success', asset, progress: 100 })
      setSelected((current) => multiple ? [...current, asset] : [asset])
      onUploaded?.(asset)
    } catch (error) {
      console.error('Failed to upload image:', error)
      updateTask(taskId, { status: 'error', error: '上传失败，请重试' })
    }
  }

  const handleFiles = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    if (!imageFiles.length) return
    setIsUploading(true)
    await Promise.all(imageFiles.map(uploadFile))
    setIsUploading(false)
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files)
    if (!files.length) return
    event.preventDefault()
    void handleFiles(files)
  }

  if (!open) return null

  return createPortal((
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
        <motion.div className="glass-card flex max-h-[min(760px,calc(100vh-24px))] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/20" initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} onMouseDown={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
            <div>
              <h2 className="font-semibold text-white">{title}</h2>
              <p className="mt-0.5 text-xs text-white/50">选择已有图片，或上传新的图片资源</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-xl px-2.5 py-1.5 text-white/60 hover:bg-white/10 hover:text-white">关闭</button>
          </div>

          <div className="flex gap-1 border-b border-white/10 px-4 pt-3 sm:px-6">
            {([['album', '相册图片'], ['upload', '本地上传'], ['paste', '粘贴图片']] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-t-xl px-3 py-2 text-sm transition-colors ${tab === value ? 'bg-white/15 text-white' : 'text-white/55 hover:bg-white/8 hover:text-white/85'}`}>{label}</button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {tab === 'album' && (
              <div className="space-y-4">
                <select value={albumId} onChange={(event) => setAlbumId(event.target.value)} className="glass-input w-full sm:max-w-xs" disabled={isLoading}>
                  {albums.map((album) => <option key={album.id} value={album.id} className="text-slate-900">{album.name}</option>)}
                </select>
                {isLoading ? <div className="py-12 text-center text-sm text-white/55">加载中...</div> : images.length === 0 ? <div className="rounded-2xl border border-dashed border-white/15 py-12 text-center text-sm text-white/50">这个相册还没有图片</div> : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                    {images.map((image) => {
                      const isSelected = selected.some((item) => item.id === image.id)
                      return <button key={image.id} type="button" onClick={() => toggleSelected(image)} className={`group relative overflow-hidden rounded-2xl border-2 text-left transition ${isSelected ? 'border-sky-300 ring-2 ring-sky-300/40' : 'border-transparent hover:border-white/30'}`}><img src={image.thumbnailUrl || image.url} alt={image.fileName} className="aspect-square w-full object-cover" loading="lazy" /><span className="absolute inset-x-0 bottom-0 truncate bg-slate-950/65 px-2 py-1.5 text-xs text-white/85">{image.fileName}</span>{isSelected && <span className="absolute right-2 top-2 rounded-full bg-sky-400 px-2 py-0.5 text-xs font-semibold text-slate-950">✓</span>}</button>
                    })}
                  </div>
                )}
              </div>
            )}

            {tab === 'upload' && (
              <div className="space-y-4">
                <button type="button" onClick={() => inputRef.current?.click()} disabled={isUploading} className="glass-input flex min-h-32 w-full cursor-pointer flex-col items-center justify-center gap-2 text-center text-white/75 hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50"><span className="text-3xl">📤</span><span>选择一张或多张图片</span><span className="text-xs text-white/45">图片会上传到当前相册：{albums.find((album) => album.id === albumId)?.name || '默认相册'}</span></button>
                <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { void handleFiles(Array.from(event.target.files || [])); event.target.value = '' }} />
              </div>
            )}

            {tab === 'paste' && <div className="space-y-4"><div className="glass-input flex min-h-32 items-center justify-center text-center text-white/65 outline-none" tabIndex={0} onPaste={handlePaste}><div><div className="mb-2 text-3xl">📋</div><p>点击这里，然后直接粘贴图片</p><p className="mt-1 text-xs text-white/45">支持截图、剪贴板图片和拖拽文件</p></div></div></div>}

            {tasks.length > 0 && <div className="mt-6 space-y-2"><div className="text-sm font-medium text-white/80">本次上传</div>{tasks.map((task) => <div key={task.id} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3"><div className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate text-white/85">{task.fileName}</span><span className="shrink-0 text-xs text-white/55">{statusLabel[task.status]}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full transition-[width] ${task.status === 'error' ? 'bg-red-400' : 'bg-gradient-to-r from-sky-300 to-violet-400'}`} style={{ width: `${task.progress}%` }} /></div>{task.error && <div className="mt-1 text-xs text-red-200">{task.error}</div>}</div>)}</div>}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 sm:px-6"><span className="text-sm text-white/55">已选择 {selected.length} 张</span><div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-white/15 px-3 py-2 text-sm text-white/70 hover:bg-white/10">取消</button><button type="button" disabled={!selected.length} onClick={() => { onConfirm(selected); onClose() }} className="rounded-xl bg-gradient-to-r from-sky-400/80 to-violet-400/80 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">插入已选图片</button></div></div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  ), document.body)
}
