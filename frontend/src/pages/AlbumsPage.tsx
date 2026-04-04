import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { clients } from '../lib/connect'
import { compressImage } from '../utils/imageCompressor'
import { useStore } from '../store/useStore'

interface Album {
  id: string
  name: string
  description: string
  isPublic: boolean
  createdAt: { toDate?: () => Date }
}

interface AlbumImage {
  id: string
  albumId: string
  url: string
  thumbnailUrl?: string
  fileName: string
  fileSize: number
  mimeType: string
  createdAt: { toDate?: () => Date }
}

interface AlbumTimelineEvent {
  id: string
  type: 'album_created' | 'image_uploaded'
  timestamp: Date
  imageUrl?: string
}

const toDate = (value?: { toDate?: () => Date }) => {
  if (!value?.toDate) return new Date()
  return value.toDate()
}

export function AlbumsPage() {
  const isLoggedIn = useStore((state) => state.isLoggedIn)

  const [albums, setAlbums] = useState<Album[]>([])
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>('')
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null)
  const [albumImages, setAlbumImages] = useState<AlbumImage[]>([])
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([])

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  const [isLoadingAlbums, setIsLoadingAlbums] = useState(true)
  const [isLoadingAlbumDetail, setIsLoadingAlbumDetail] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadWithRetry = async (url: string, file: File, headers: Record<string, string>, retries = 2) => {
    let lastError: unknown
    for (let i = 0; i <= retries; i += 1) {
      try {
        const res = await fetch(url, {
          method: 'PUT',
          headers,
          body: file,
        })
        if (!res.ok) {
          throw new Error(`upload failed with status ${res.status}`)
        }
        return
      } catch (err) {
        lastError = err
      }
    }
    throw lastError
  }

  useEffect(() => {
    const loadAlbums = async () => {
      setIsLoadingAlbums(true)
      try {
        const response = await clients.album.listAlbums({ pageSize: 100, onlyPublic: false })
        const loadedAlbums = response.albums || []
        setAlbums(loadedAlbums)
        if (loadedAlbums.length > 0) {
          setSelectedAlbumId((prev) => prev || loadedAlbums[0].id)
        }
      } catch (err) {
        console.error('Failed to load albums:', err)
      } finally {
        setIsLoadingAlbums(false)
      }
    }

    loadAlbums()
  }, [])

  useEffect(() => {
    if (!selectedAlbumId) {
      setSelectedAlbum(null)
      setAlbumImages([])
      setSelectedImageIds([])
      return
    }

    const loadAlbumDetail = async () => {
      setIsLoadingAlbumDetail(true)
      try {
        const response = await clients.album.getAlbum({ albumId: selectedAlbumId })
        setSelectedAlbum((response.album as Album | null) || null)
        setAlbumImages((response.images as AlbumImage[]) || [])
      } catch (err) {
        console.error('Failed to load album details:', err)
        setSelectedAlbum(null)
        setAlbumImages([])
      } finally {
        setIsLoadingAlbumDetail(false)
      }
    }

    loadAlbumDetail()
  }, [selectedAlbumId])

  const timelineEvents = useMemo(() => {
    const events: AlbumTimelineEvent[] = []
    if (selectedAlbum) {
      events.push({
        id: `album-${selectedAlbum.id}`,
        type: 'album_created',
        timestamp: toDate(selectedAlbum.createdAt),
      })
    }

    for (const image of albumImages) {
      events.push({
        id: `image-${image.id}`,
        type: 'image_uploaded',
        timestamp: toDate(image.createdAt),
        imageUrl: image.thumbnailUrl || image.url,
      })
    }

    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }, [selectedAlbum, albumImages])

  const refreshAlbums = async (preferAlbumId?: string) => {
    setIsLoadingAlbums(true)
    try {
      const response = await clients.album.listAlbums({ pageSize: 100, onlyPublic: false })
      const loadedAlbums = (response.albums as Album[] | undefined) || []
      setAlbums(loadedAlbums)
      if (loadedAlbums.length === 0) {
        setSelectedAlbumId('')
      } else if (preferAlbumId && loadedAlbums.some((item) => item.id === preferAlbumId)) {
        setSelectedAlbumId(preferAlbumId)
      } else if (!loadedAlbums.some((item) => item.id === selectedAlbumId)) {
        setSelectedAlbumId(loadedAlbums[0].id)
      }
    } finally {
      setIsLoadingAlbums(false)
    }
  }

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setIsCreating(true)
    try {
      const response = await clients.album.createAlbum({
        name: name.trim(),
        description: description.trim(),
        isPublic,
      })

      if (!response.album?.id) {
        throw new Error('Album id not returned')
      }

      await refreshAlbums(response.album.id)
      setName('')
      setDescription('')
      setIsPublic(true)
    } catch (err) {
      console.error('Failed to create album:', err)
      alert('创建相册失败，请稍后重试')
    } finally {
      setIsCreating(false)
    }
  }

  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!selectedAlbumId || files.length === 0) return

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    setIsUploading(true)
    try {
      const uploadedImageIds: string[] = []

      for (const file of files) {
        const compressedFile = await compressImage(file)

        const req = await clients.album.uploadImageRequest({
          albumId: selectedAlbumId,
          fileName: compressedFile.name,
          mimeType: compressedFile.type,
          fileSize: compressedFile.size,
        })

        const headers: Record<string, string> = typeof req.headers === 'object' ? { ...req.headers } : {}
        if (compressedFile.type && !headers['Content-Type']) {
          headers['Content-Type'] = compressedFile.type
        }

        await uploadWithRetry(req.uploadUrl, compressedFile, headers)

        const confirm = await clients.album.confirmImageUpload({
          imageId: req.imageId,
          uploadUrl: req.uploadUrl,
        })

        if (!confirm.image) continue
        uploadedImageIds.push(confirm.image.id)
      }

      if (uploadedImageIds.length > 0) {
        const albumName = selectedAlbum?.name || '未命名相册'
        const content = `📸 更新了相册《${albumName}》，上传了 ${uploadedImageIds.length} 张照片`
        await clients.post.createPost({
          content,
          imageIds: uploadedImageIds,
        })
      }

      const refreshed = await clients.album.getAlbum({ albumId: selectedAlbumId })
      setSelectedAlbum((refreshed.album as Album | null) || null)
      setAlbumImages((refreshed.images as AlbumImage[]) || [])
      setSelectedImageIds([])
    } catch (err) {
      console.error('Failed to upload image:', err)
      alert('上传图片失败，请稍后重试')
    } finally {
      setIsUploading(false)
    }
  }

  const formatTime = (d: Date) =>
    d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

  const toggleImageSelection = (imageId: string) => {
    setSelectedImageIds((prev) =>
      prev.includes(imageId) ? prev.filter((id) => id !== imageId) : [...prev, imageId],
    )
  }

  const handleDeleteImages = async (imageIds: string[]) => {
    if (!selectedAlbumId || imageIds.length === 0) return
    if (!window.confirm(`确定删除 ${imageIds.length} 张照片吗？`)) return

    setIsDeleting(true)
    try {
      const response = await clients.album.deleteImages({
        albumId: selectedAlbumId,
        imageIds,
      })

      const refreshed = await clients.album.getAlbum({ albumId: selectedAlbumId })
      setSelectedAlbum((refreshed.album as Album | null) || null)
      setAlbumImages((refreshed.images as AlbumImage[]) || [])
      setSelectedImageIds([])

      const scheduledAt = response.scheduledDeleteAt?.toDate?.() || new Date()
      alert(`已删除 ${response.deletedCount} 张照片，OSS 文件将在 ${formatTime(scheduledAt)} 后清理。`)
    } catch (err) {
      console.error('Failed to delete images:', err)
      alert('删除失败，请稍后重试')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel rounded-4xl p-6"
      >
        <h2 className="text-2xl text-white font-bold text-gradient">相册空间</h2>
        <p className="text-white/65 mt-2 text-sm">
          全后端数据模式：相册列表、相册详情、图片清单全部来自后端接口，并记录为可回放的相册时间线。
        </p>
      </motion.div>

      {!isLoggedIn ? (
        <div className="glass-card rounded-4xl p-8 text-center text-white/75">
          <p className="text-5xl mb-3">🔐</p>
          <p>登录后可创建相册并上传图片</p>
        </div>
      ) : (
        <>
          <motion.form
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleCreateAlbum}
            className="glass-card rounded-4xl p-6 grid gap-4"
          >
            <div className="grid md:grid-cols-2 gap-4">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="相册名称"
                className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20 focus:outline-none focus:border-white/40"
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="相册描述（可选）"
                className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20 focus:outline-none focus:border-white/40"
              />
            </div>
            <label className="inline-flex items-center gap-3 text-white/80 text-sm">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="w-4 h-4"
              />
              公开相册
            </label>
            <div className="flex justify-end">
              <button type="submit" disabled={isCreating || !name.trim()} className="btn-primary px-5 py-2 rounded-2xl text-white disabled:opacity-50">
                {isCreating ? '创建中...' : '创建相册'}
              </button>
            </div>
          </motion.form>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card rounded-4xl p-6">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <div className="flex gap-2 flex-wrap">
                {isLoadingAlbums && albums.length === 0 && (
                  <span className="text-white/60 text-sm">相册加载中...</span>
                )}
                {albums.map((album) => (
                  <button
                    key={album.id}
                    onClick={() => setSelectedAlbumId(album.id)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                      selectedAlbumId === album.id
                        ? 'bg-white/30 text-white border-white/40'
                        : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/20 hover:text-white'
                    }`}
                  >
                    {album.name}
                  </button>
                ))}
              </div>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleUploadImages}
                  disabled={!selectedAlbumId || isUploading}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!selectedAlbumId || isUploading || isDeleting}
                  className="btn-primary px-4 py-2 rounded-2xl text-white disabled:opacity-50"
                >
                  {isUploading ? '上传中...' : '上传图片'}
                </button>
              </div>
            </div>

            {!selectedAlbum ? (
              <div className="text-center py-10 text-white/60">
                <p className="text-4xl mb-3">📸</p>
                <p>请先创建一个相册</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="mb-4 text-white/75 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                    <h3 className="text-xl font-semibold text-white">{selectedAlbum.name}</h3>
                    <p className="text-sm text-white/60 mt-1">{selectedAlbum.description || '暂无描述'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectionMode((prev) => !prev)
                          setSelectedImageIds([])
                        }}
                        className={`px-3 py-1.5 rounded-full border text-sm transition-all ${
                          selectionMode
                            ? 'bg-white/25 text-white border-white/40'
                            : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/20 hover:text-white'
                        }`}
                      >
                        {selectionMode ? '退出多选' : '多选'}
                      </button>
                      {selectionMode && selectedImageIds.length > 0 && (
                        <button
                          onClick={() => handleDeleteImages(selectedImageIds)}
                          disabled={isDeleting}
                          className="px-3 py-1.5 rounded-full border text-sm bg-red-500/25 text-red-100 border-red-300/40 hover:bg-red-500/35 disabled:opacity-50"
                        >
                          {isDeleting ? '删除中...' : `删除已选 ${selectedImageIds.length}`}
                        </button>
                      )}
                    </div>
                  </div>

                  {(isUploading || isLoadingAlbumDetail) && (
                    <div className="py-3">
                      <LoadingSpinner text={isUploading ? '正在上传图片...' : '正在加载相册详情...'} />
                    </div>
                  )}

                  {albumImages.length === 0 ? (
                    <div className="text-center py-14 text-white/55 glass-light rounded-3xl">这个相册还没有图片</div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {albumImages.map((image) => (
                        <div key={image.id} className="relative h-52 rounded-3xl overflow-hidden border border-white/15 bg-black/10 group">
                          <motion.img
                            whileHover={{ scale: 1.03 }}
                            src={image.thumbnailUrl || image.url}
                            alt="Album"
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => {
                              if (selectionMode) {
                                toggleImageSelection(image.id)
                                return
                              }
                              setSelectedImage(image.url)
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent pointer-events-none" />

                          {selectionMode ? (
                            <button
                              onClick={() => toggleImageSelection(image.id)}
                              className={`absolute top-2 left-2 w-7 h-7 rounded-full border flex items-center justify-center text-sm ${
                                selectedImageIds.includes(image.id)
                                  ? 'bg-white text-black border-white'
                                  : 'bg-black/45 text-white border-white/40'
                              }`}
                            >
                              {selectedImageIds.includes(image.id) ? '✓' : ''}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDeleteImages([image.id])}
                              disabled={isDeleting}
                              className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-red-500/75 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                            >
                              删除
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="glass-light rounded-3xl p-5">
                  <h4 className="text-white font-semibold mb-4">相册时间线</h4>
                  <div className="relative pl-10 space-y-4 max-h-[360px] overflow-y-auto scrollbar-hide">
                    <div className="absolute left-4 top-1 bottom-1 w-0.5 bg-gradient-to-b from-pink-300/70 via-rose-300/40 to-transparent" />
                    {timelineEvents.length === 0 ? (
                      <p className="text-white/50 text-sm">暂无事件</p>
                    ) : (
                      timelineEvents.map((event) => (
                        <div key={event.id} className="relative">
                          <span className="absolute -left-8 top-2.5 w-4 h-4 rounded-full bg-white/85 border-2 border-pink-300/70" />
                          <div className="rounded-2xl bg-white/10 border border-white/15 p-2">
                            {event.type === 'image_uploaded' && event.imageUrl ? (
                              <button
                                onClick={() => setSelectedImage(event.imageUrl!)}
                                className="w-full h-24 rounded-xl overflow-hidden"
                              >
                                <img src={event.imageUrl} alt="timeline" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                              </button>
                            ) : (
                              <div className="h-24 rounded-xl bg-gradient-to-br from-pink-300/20 to-rose-300/20 border border-white/10 flex items-center justify-center text-white/80 text-sm">
                                📸 相册创建
                              </div>
                            )}
                            <p className="text-white/45 text-xs mt-2 px-1">{formatTime(event.timestamp)}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}

      {createPortal(
        <AnimatePresence>
          {selectedImage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[130] bg-black/90 p-4 flex items-center justify-center cursor-zoom-out"
              onClick={() => setSelectedImage(null)}
            >
              <motion.img
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.15 }}
                src={selectedImage}
                alt="Enlarged"
                className="max-w-[95vw] max-h-[95vh] object-contain rounded-xl"
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedImage(null)
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
