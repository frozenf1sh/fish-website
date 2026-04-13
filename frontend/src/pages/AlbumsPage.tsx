import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { clients } from '../lib/connect'
import { showToast } from '../lib/toast'
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

interface AlbumCardMeta {
  count: number
  coverUrl: string
}

interface ImageReferenceItem {
  imageId: string
  url: string
  fileName: string
  referenceCount: number
  postReferenceCount: number
  blogReferenceCount: number
  avatarReferenceCount: number
  backgroundReferenceCount: number
  faviconReferenceCount: number
  safeToDelete: boolean
}

const RECYCLE_BIN_ALBUM_ID = 'recycle-bin'
const DEFAULT_ALBUM_ID = 'default'

const isSpecialAlbum = (albumId: string) => albumId === RECYCLE_BIN_ALBUM_ID || albumId === DEFAULT_ALBUM_ID

const toDate = (value?: { toDate?: () => Date }) => {
  if (!value?.toDate) return new Date()
  return value.toDate()
}

const formatDayLabel = (d: Date) => {
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.floor((startOfToday - startOfTarget) / (24 * 60 * 60 * 1000))
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function AlbumsPage() {
  const isLoggedIn = useStore((state) => state.isLoggedIn)

  const [albums, setAlbums] = useState<Album[]>([])
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>('')
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null)
  const [albumImages, setAlbumImages] = useState<AlbumImage[]>([])
  const [albumCardMeta, setAlbumCardMeta] = useState<Record<string, AlbumCardMeta>>({})
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([])
  const [moveTargetAlbumId, setMoveTargetAlbumId] = useState('')
  const [isMoveMode, setIsMoveMode] = useState(false)
  const [isEditAlbumOpen, setIsEditAlbumOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editIsPublic, setEditIsPublic] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [confirmDeleteTitle, setConfirmDeleteTitle] = useState('')
  const [confirmDeleteMessage, setConfirmDeleteMessage] = useState('')
  const [pendingDeleteImageIds, setPendingDeleteImageIds] = useState<string[]>([])
  const [pendingDeleteAlbumId, setPendingDeleteAlbumId] = useState('')
  const [isReferencePanelOpen, setIsReferencePanelOpen] = useState(false)
  const [isAnalyzingReferences, setIsAnalyzingReferences] = useState(false)
  const [isRepairingReferences, setIsRepairingReferences] = useState(false)
  const [referenceItems, setReferenceItems] = useState<ImageReferenceItem[]>([])
  const [referenceSummary, setReferenceSummary] = useState({ totalImages: 0, deletableImages: 0, referencedImages: 0, totalReferenceCount: 0 })

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)

  const [isLoadingAlbums, setIsLoadingAlbums] = useState(true)
  const [isLoadingAlbumDetail, setIsLoadingAlbumDetail] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isMoving, setIsMoving] = useState(false)
  const [isSavingAlbumEdit, setIsSavingAlbumEdit] = useState(false)
  const [isDeletingAlbum, setIsDeletingAlbum] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const sortedAlbums = useMemo(() => {
    const rank = (id: string) => {
      if (id === DEFAULT_ALBUM_ID) return 0
      if (id === RECYCLE_BIN_ALBUM_ID) return 1
      return 2
    }
    return [...albums].sort((a, b) => {
      const ra = rank(a.id)
      const rb = rank(b.id)
      if (ra !== rb) return ra - rb
      const ta = a.createdAt?.toDate?.()?.getTime?.() || 0
      const tb = b.createdAt?.toDate?.()?.getTime?.() || 0
      return tb - ta
    })
  }, [albums])

  const referenceLookup = useMemo(() => {
    const map = new Map<string, ImageReferenceItem>()
    for (const item of referenceItems) {
      map.set(item.imageId, item)
    }
    return map
  }, [referenceItems])

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

  const hydrateAlbumCardMeta = async (list: Album[]) => {
    const entries = await Promise.all(
      list.map(async (album) => {
        try {
          const detail = await clients.album.getAlbum({ albumId: album.id })
          const images = (detail.images as AlbumImage[] | undefined) || []
          return [album.id, { count: images.length, coverUrl: images[0]?.thumbnailUrl || images[0]?.url || '' }] as const
        } catch {
          return [album.id, { count: 0, coverUrl: '' }] as const
        }
      }),
    )
    setAlbumCardMeta((prev) => {
      const next = { ...prev }
      for (const [id, meta] of entries) {
        next[id] = meta
      }
      return next
    })
  }

  useEffect(() => {
    const loadAlbums = async () => {
      setIsLoadingAlbums(true)
      try {
        const response = await clients.album.listAlbums({ pageSize: 100, onlyPublic: !isLoggedIn })
        let loadedAlbums = (response.albums as Album[] | undefined) || []
        if (isLoggedIn && !loadedAlbums.some((item) => item.id === RECYCLE_BIN_ALBUM_ID)) {
          try {
            const recycle = await clients.album.getAlbum({ albumId: RECYCLE_BIN_ALBUM_ID })
            if (recycle.album) {
              loadedAlbums = [...loadedAlbums, recycle.album as Album]
            }
          } catch {
            // Ignore and keep current list if recycle bin cannot be fetched.
          }
        }
        setAlbums(loadedAlbums)
        await hydrateAlbumCardMeta(loadedAlbums)
        setSelectedAlbumId((prev) => {
          if (!prev) return ''
          return loadedAlbums.some((item) => item.id === prev) ? prev : ''
        })
      } catch (err) {
        console.error('Failed to load albums:', err)
      } finally {
        setIsLoadingAlbums(false)
      }
    }

    loadAlbums()
  }, [isLoggedIn])

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

  useEffect(() => {
    setIsMoveMode(false)
    setMoveTargetAlbumId('')
    setSelectionMode(false)
    setSelectedImageIds([])
    setReferenceItems([])
  }, [selectedAlbum?.id])

  const groupedImages = useMemo(() => {
    const groups = new Map<string, { label: string; images: AlbumImage[]; time: number }>()
    for (const image of albumImages) {
      const date = toDate(image.createdAt)
      const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
      if (!groups.has(key)) {
        groups.set(key, { label: formatDayLabel(date), images: [], time: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() })
      }
      groups.get(key)!.images.push(image)
    }
    return Array.from(groups.values()).sort((a, b) => b.time - a.time)
  }, [albumImages])

  const refreshAlbums = async (preferAlbumId?: string) => {
    setIsLoadingAlbums(true)
    try {
      const response = await clients.album.listAlbums({ pageSize: 100, onlyPublic: !isLoggedIn })
      let loadedAlbums = (response.albums as Album[] | undefined) || []
      if (isLoggedIn && !loadedAlbums.some((item) => item.id === RECYCLE_BIN_ALBUM_ID)) {
        try {
          const recycle = await clients.album.getAlbum({ albumId: RECYCLE_BIN_ALBUM_ID })
          if (recycle.album) {
            loadedAlbums = [...loadedAlbums, recycle.album as Album]
          }
        } catch {
          // Ignore and keep current list if recycle bin cannot be fetched.
        }
      }
      setAlbums(loadedAlbums)
      await hydrateAlbumCardMeta(loadedAlbums)
      if (loadedAlbums.length === 0) {
        setSelectedAlbumId('')
      } else if (preferAlbumId && loadedAlbums.some((item) => item.id === preferAlbumId)) {
        setSelectedAlbumId(preferAlbumId)
      } else if (!selectedAlbumId || !loadedAlbums.some((item) => item.id === selectedAlbumId)) {
        setSelectedAlbumId('')
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
      setIsPublic(false)
    } catch (err) {
      console.error('Failed to create album:', err)
      showToast({ type: 'error', message: '创建相册失败，请稍后重试' })
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
      showToast({ type: 'error', message: '上传图片失败，请稍后重试' })
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
      if (selectedAlbumId === RECYCLE_BIN_ALBUM_ID) {
        showToast({ type: 'success', message: `已永久删除 ${response.deletedCount} 张照片` })
      } else {
        showToast({ type: 'success', message: `已移入回收站 ${response.deletedCount} 张照片，将于 ${formatTime(scheduledAt)} 自动清空` })
      }
    } catch (err) {
      console.error('Failed to delete images:', err)
      showToast({ type: 'error', message: '删除失败，请稍后重试' })
    } finally {
      setIsDeleting(false)
    }
  }

  const requestDeleteImages = (imageIds: string[]) => {
    if (!selectedAlbumId || imageIds.length === 0) return
    setPendingDeleteImageIds(imageIds)
    setPendingDeleteAlbumId('')
    setConfirmDeleteTitle(selectedAlbumId === RECYCLE_BIN_ALBUM_ID ? '永久删除照片' : '删除照片')
    setConfirmDeleteMessage(
      selectedAlbumId === RECYCLE_BIN_ALBUM_ID
        ? `确定永久删除所选 ${imageIds.length} 张照片吗？此操作不可恢复。`
        : `确定删除所选 ${imageIds.length} 张照片吗？照片会移动到回收站。`,
    )
    setConfirmDeleteOpen(true)
  }

  const handleMoveImages = async () => {
    if (!selectedAlbumId || !moveTargetAlbumId || selectedImageIds.length === 0) return

    setIsMoving(true)
    try {
      const response = await clients.album.moveImages({
        fromAlbumId: selectedAlbumId,
        targetAlbumId: moveTargetAlbumId,
        imageIds: selectedImageIds,
      })

      const refreshed = await clients.album.getAlbum({ albumId: selectedAlbumId })
      setSelectedAlbum((refreshed.album as Album | null) || null)
      setAlbumImages((refreshed.images as AlbumImage[]) || [])
      setSelectedImageIds([])
      setMoveTargetAlbumId('')
      setIsMoveMode(false)
      setSelectionMode(false)

      if (selectedAlbumId === RECYCLE_BIN_ALBUM_ID) {
        showToast({ type: 'success', message: `已恢复 ${response.movedCount} 张照片到目标相册` })
      } else {
        showToast({ type: 'success', message: `已移动 ${response.movedCount} 张照片` })
      }
    } catch (err) {
      console.error('Failed to move images:', err)
      showToast({ type: 'error', message: '移动照片失败，请稍后重试' })
    } finally {
      setIsMoving(false)
    }
  }

  const openEditAlbum = () => {
    if (!selectedAlbum) return
    setEditName(selectedAlbum.name || '')
    setEditDescription(selectedAlbum.description || '')
    setEditIsPublic(!!selectedAlbum.isPublic)
    setIsEditAlbumOpen(true)
  }

  const handleSaveAlbumEdit = async () => {
    if (!selectedAlbum || !editName.trim()) return
    if (isSpecialAlbum(selectedAlbum.id)) {
      showToast({ type: 'error', message: '默认相册和回收站不支持改名' })
      return
    }
    setIsSavingAlbumEdit(true)
    try {
      await clients.album.updateAlbum({
        albumId: selectedAlbum.id,
        name: editName.trim(),
        description: editDescription.trim(),
        isPublic: editIsPublic,
      })
      showToast({ type: 'success', message: '相册信息已更新' })
      await refreshAlbums(selectedAlbum.id)
      setIsEditAlbumOpen(false)
    } catch (err) {
      console.error('Failed to update album:', err)
      showToast({ type: 'error', message: '编辑相册失败，请稍后重试' })
    } finally {
      setIsSavingAlbumEdit(false)
    }
  }

  const handleDeleteAlbum = async () => {
    const albumId = pendingDeleteAlbumId
    if (!albumId) return

    setIsDeletingAlbum(true)
    try {
      await clients.album.deleteAlbum({ albumId })
      showToast({ type: 'success', message: '相册已删除，照片已移入回收站' })
      await refreshAlbums(RECYCLE_BIN_ALBUM_ID)
      setSelectedAlbumId(RECYCLE_BIN_ALBUM_ID)
      setConfirmDeleteOpen(false)
      setPendingDeleteAlbumId('')
    } catch (err) {
      console.error('Failed to delete album:', err)
      showToast({ type: 'error', message: '删除相册失败，请稍后重试' })
    } finally {
      setIsDeletingAlbum(false)
    }
  }

  const requestDeleteAlbum = () => {
    if (!selectedAlbum || isSpecialAlbum(selectedAlbum.id)) return
    setPendingDeleteImageIds([])
    setPendingDeleteAlbumId(selectedAlbum.id)
    setConfirmDeleteTitle('删除相册')
    setConfirmDeleteMessage(`确定删除相册《${selectedAlbum.name}》吗？其中照片会自动移动到回收站。`)
    setConfirmDeleteOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (pendingDeleteAlbumId) {
      await handleDeleteAlbum()
      return
    }
    if (pendingDeleteImageIds.length > 0) {
      await handleDeleteImages(pendingDeleteImageIds)
      setConfirmDeleteOpen(false)
      setPendingDeleteImageIds([])
    }
  }

  const handleAnalyzeReferences = async () => {
    if (!selectedAlbumId) return
    setIsAnalyzingReferences(true)
    try {
      const response = await clients.album.analyzeImageReferences({ albumId: selectedAlbumId })
      setReferenceItems((response.references as ImageReferenceItem[]) || [])
      setReferenceSummary({
        totalImages: response.totalImages || 0,
        deletableImages: response.deletableImages || 0,
        referencedImages: response.referencedImages || 0,
        totalReferenceCount: response.totalReferenceCount || 0,
      })
      setIsReferencePanelOpen(true)
    } catch (err) {
      console.error('Failed to analyze references:', err)
      showToast({ type: 'error', message: '引用分析失败，请稍后重试' })
    } finally {
      setIsAnalyzingReferences(false)
    }
  }

  const handleRepairReferences = async () => {
    setIsRepairingReferences(true)
    try {
      const result = await clients.album.repairImageReferences()
      showToast({ type: 'success', message: `一致性修复完成：${result.referencedImages} 张被引用图片` })
      await handleAnalyzeReferences()
    } catch (err) {
      console.error('Failed to repair references:', err)
      showToast({ type: 'error', message: '一致性修复失败，请稍后重试' })
    } finally {
      setIsRepairingReferences(false)
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
          全后端数据模式：相册列表、相册详情、图片清单全部来自后端接口；删除图片将进入回收站并在每日零点清空。
        </p>
      </motion.div>

      {!isLoggedIn && (
        <div className="glass-card rounded-4xl p-8 text-center text-white/75">
          <p className="text-5xl mb-3">🌐</p>
          <p>当前为访客模式，仅可查看公开相册</p>
        </div>
      )}

      {isLoggedIn && (
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
              公开相册（默认私密）
            </label>
            <div className="flex justify-end">
              <button type="submit" disabled={isCreating || !name.trim()} className="btn-primary px-5 py-2 rounded-2xl text-white disabled:opacity-50">
                {isCreating ? '创建中...' : '创建相册'}
              </button>
            </div>
          </motion.form>

        </>
      )}

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card rounded-4xl p-6">
        {!selectedAlbumId ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-lg font-semibold text-white">选择相册</h3>
              {isLoadingAlbums && <span className="text-white/60 text-sm">相册加载中...</span>}
            </div>
            {sortedAlbums.length === 0 ? (
              <div className="text-center py-10 text-white/60">
                <p className="text-4xl mb-3">📸</p>
                <p>请先创建一个相册</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {sortedAlbums.map((album) => {
                  const meta = albumCardMeta[album.id] || { count: 0, coverUrl: '' }
                  return (
                    <button
                      key={album.id}
                      onClick={() => setSelectedAlbumId(album.id)}
                      className="text-left rounded-2xl overflow-hidden border border-white/20 transition-all hover:border-white/40"
                    >
                      <div className="aspect-square bg-black/20 relative">
                        {meta.coverUrl ? (
                          <img src={meta.coverUrl} alt={album.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-slate-500/20 via-white/10 to-slate-200/20 flex items-center justify-center text-4xl">
                            {album.id === RECYCLE_BIN_ALBUM_ID ? '🗑️' : '🖼️'}
                          </div>
                        )}
                        {isSpecialAlbum(album.id) && (
                          <span className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-black/45 text-white text-xs">
                            {album.id === DEFAULT_ALBUM_ID ? '默认相册' : '回收站'}
                          </span>
                        )}
                      </div>
                      <div className="p-3 bg-white/5">
                        <p className="text-white font-medium truncate">{album.name}</p>
                        <p className="text-white/65 text-xs mt-1">{meta.count} 张照片</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : !selectedAlbum ? (
          <div className="space-y-4">
            {isLoadingAlbumDetail ? (
              <div className="py-3">
                <LoadingSpinner text="正在加载相册详情..." />
              </div>
            ) : (
              <div className="text-center py-10 text-white/60">
                <p>相册不存在或已被删除</p>
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => setSelectedAlbumId('')}
                className="px-4 py-2 rounded-2xl border border-white/30 text-white/90 hover:bg-white/10"
              >
                退出相册
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="mb-4 text-white/75 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-xl font-semibold text-white">{selectedAlbum.name}</h3>
                <p className="text-sm text-white/60 mt-1">{selectedAlbum.description || '暂无描述'}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <button
                  onClick={() => setSelectedAlbumId('')}
                  className="px-4 py-2 rounded-2xl border border-white/30 text-white/90 hover:bg-white/10"
                >
                  退出相册
                </button>
                {isLoggedIn && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleUploadImages}
                      disabled={isUploading}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || isDeleting}
                      className="btn-primary px-4 py-2 rounded-2xl text-white disabled:opacity-50"
                    >
                      {isUploading ? '上传中...' : '上传图片'}
                    </button>
                    {!isSpecialAlbum(selectedAlbum.id) && (
                      <button
                        onClick={openEditAlbum}
                        className="px-4 py-2 rounded-2xl border border-white/30 text-white/90 hover:bg-white/10"
                      >
                        编辑相册
                      </button>
                    )}
                    {!isSpecialAlbum(selectedAlbum.id) && (
                      <button
                        onClick={requestDeleteAlbum}
                        disabled={isDeletingAlbum}
                        className="px-4 py-2 rounded-2xl border border-red-300/40 text-red-100 bg-red-500/20 hover:bg-red-500/35 disabled:opacity-50"
                      >
                        {isDeletingAlbum ? '删除中...' : '删除相册'}
                      </button>
                    )}
                    {isSpecialAlbum(selectedAlbum.id) && (
                      <button
                        onClick={handleAnalyzeReferences}
                        disabled={isAnalyzingReferences}
                        className="px-4 py-2 rounded-2xl border border-amber-300/40 text-amber-100 bg-amber-500/20 hover:bg-amber-500/35 disabled:opacity-50"
                      >
                        {isAnalyzingReferences ? '分析中...' : '引用分析'}
                      </button>
                    )}
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
                    {selectionMode && (
                      <button
                        onClick={() => setIsMoveMode((prev) => !prev)}
                        className={`px-3 py-1.5 rounded-full border text-sm transition-all ${
                          isMoveMode
                            ? 'bg-white/25 text-white border-white/40'
                            : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/20 hover:text-white'
                        }`}
                      >
                        {isMoveMode ? '取消移动' : '移动到相册'}
                      </button>
                    )}
                    {selectionMode && isMoveMode && (
                      <>
                        <select
                          value={moveTargetAlbumId}
                          onChange={(e) => setMoveTargetAlbumId(e.target.value)}
                          className="px-3 py-1.5 rounded-full border text-sm bg-white/10 text-white border-white/20"
                        >
                          <option value="">选择目标相册</option>
                          {albums
                            .filter((album) => album.id !== selectedAlbumId)
                            .map((album) => (
                              <option key={album.id} value={album.id} className="text-slate-900">
                                {album.name}
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={handleMoveImages}
                          disabled={isMoving || !moveTargetAlbumId || selectedImageIds.length === 0}
                          className="px-3 py-1.5 rounded-full border text-sm bg-emerald-500/25 text-emerald-100 border-emerald-300/40 hover:bg-emerald-500/35 disabled:opacity-50"
                        >
                          {isMoving ? '移动中...' : `移动已选 ${selectedImageIds.length}`}
                        </button>
                      </>
                    )}
                    {selectionMode && selectedImageIds.length > 0 && (
                      <button
                        onClick={() => requestDeleteImages(selectedImageIds)}
                        disabled={isDeleting || isMoving}
                        className="px-3 py-1.5 rounded-full border text-sm bg-red-500/25 text-red-100 border-red-300/40 hover:bg-red-500/35 disabled:opacity-50"
                      >
                        {isDeleting ? '删除中...' : `删除已选 ${selectedImageIds.length}`}
                      </button>
                    )}
                  </>
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
              <div className="space-y-6">
                {groupedImages.map((group) => (
                  <div key={group.time} className="space-y-3">
                    <h4 className="text-white/85 font-semibold">{group.label}</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {group.images.map((image) => (
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
                          {referenceLookup.has(image.id) && !selectionMode && (
                            <div
                              className={`absolute inset-0 pointer-events-none ${referenceLookup.get(image.id)?.safeToDelete ? 'bg-emerald-500/35' : 'bg-red-500/35'}`}
                            />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent pointer-events-none" />
                          {referenceLookup.has(image.id) && !selectionMode && (
                            <span
                              className={`absolute bottom-2 left-2 px-2 py-1 rounded-md text-xs ${referenceLookup.get(image.id)?.safeToDelete ? 'bg-emerald-800/80 text-emerald-100' : 'bg-red-900/80 text-red-100'}`}
                            >
                              {referenceLookup.get(image.id)?.safeToDelete ? '可删除' : '有引用'}
                            </span>
                          )}

                          {isLoggedIn && selectionMode ? (
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
                          ) : isLoggedIn ? (
                            <button
                              onClick={() => requestDeleteImages([image.id])}
                              disabled={isDeleting}
                              className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-red-500/75 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                            >
                              删除
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </motion.div>

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

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={confirmDeleteTitle}
        message={confirmDeleteMessage}
        confirmText="确认删除"
        cancelText="取消"
        danger
        loading={isDeleting || isDeletingAlbum}
        onCancel={() => {
          if (isDeleting || isDeletingAlbum) return
          setConfirmDeleteOpen(false)
          setPendingDeleteAlbumId('')
          setPendingDeleteImageIds([])
        }}
        onConfirm={handleConfirmDelete}
      />

      {createPortal(
        <AnimatePresence>
          {isEditAlbumOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[145] bg-black/55 backdrop-blur-sm p-4 flex items-center justify-center"
              onClick={() => !isSavingAlbumEdit && setIsEditAlbumOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                className="w-full max-w-lg rounded-3xl border border-white/20 bg-slate-900/95 text-white shadow-2xl p-5"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-semibold">编辑相册</h3>
                <div className="mt-4 space-y-3">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="相册名称"
                    className="w-full px-3 py-2 rounded-xl bg-white/10 text-white border border-white/20 focus:outline-none focus:border-white/40"
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="相册描述"
                    className="w-full min-h-[92px] px-3 py-2 rounded-xl bg-white/10 text-white border border-white/20 focus:outline-none focus:border-white/40"
                  />
                  <label className="inline-flex items-center gap-2 text-white/85 text-sm">
                    <input
                      type="checkbox"
                      checked={editIsPublic}
                      onChange={(e) => setEditIsPublic(e.target.checked)}
                      className="w-4 h-4"
                    />
                    公开相册
                  </label>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    onClick={() => setIsEditAlbumOpen(false)}
                    disabled={isSavingAlbumEdit}
                    className="px-4 py-2 rounded-xl border border-white/25 text-white/85 hover:bg-white/10 disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveAlbumEdit}
                    disabled={isSavingAlbumEdit || !editName.trim()}
                    className="px-4 py-2 rounded-xl bg-sky-500/85 text-white hover:bg-sky-500 disabled:opacity-50"
                  >
                    {isSavingAlbumEdit ? '保存中...' : '保存修改'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {createPortal(
        <AnimatePresence>
          {isReferencePanelOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[146] bg-black/55 backdrop-blur-sm p-4 flex items-center justify-center"
              onClick={() => !isRepairingReferences && setIsReferencePanelOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                className="w-full max-w-4xl max-h-[86vh] rounded-3xl border border-white/20 bg-slate-900/95 text-white shadow-2xl p-5 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h3 className="text-lg font-semibold">图片引用分析</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={handleRepairReferences}
                      disabled={isRepairingReferences}
                      className="px-3 py-1.5 rounded-xl border border-sky-300/40 text-sky-100 bg-sky-500/20 hover:bg-sky-500/35 disabled:opacity-50"
                    >
                      {isRepairingReferences ? '修复中...' : '一致性修复'}
                    </button>
                    <button
                      onClick={() => setIsReferencePanelOpen(false)}
                      disabled={isRepairingReferences}
                      className="px-3 py-1.5 rounded-xl border border-white/25 text-white/85 hover:bg-white/10 disabled:opacity-50"
                    >
                      关闭
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-xl bg-white/10 p-3">总图片: {referenceSummary.totalImages}</div>
                  <div className="rounded-xl bg-emerald-500/20 p-3">可安全删除: {referenceSummary.deletableImages}</div>
                  <div className="rounded-xl bg-amber-500/20 p-3">被引用图片: {referenceSummary.referencedImages}</div>
                  <div className="rounded-xl bg-white/10 p-3">总引用计数: {referenceSummary.totalReferenceCount}</div>
                </div>

                <div className="mt-4 overflow-auto max-h-[58vh] rounded-2xl border border-white/15">
                  <table className="w-full text-sm">
                    <thead className="bg-white/10 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2">图片</th>
                        <th className="text-left px-3 py-2">总引用</th>
                        <th className="text-left px-3 py-2">帖子</th>
                        <th className="text-left px-3 py-2">博客</th>
                        <th className="text-left px-3 py-2">头像</th>
                        <th className="text-left px-3 py-2">背景</th>
                        <th className="text-left px-3 py-2">网站图标</th>
                        <th className="text-left px-3 py-2">删除安全性</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referenceItems.map((item) => (
                        <tr key={item.imageId} className="border-t border-white/10">
                          <td className="px-3 py-2 truncate max-w-[280px]" title={item.fileName}>{item.fileName || item.imageId}</td>
                          <td className="px-3 py-2">{item.referenceCount}</td>
                          <td className="px-3 py-2">{item.postReferenceCount}</td>
                          <td className="px-3 py-2">{item.blogReferenceCount}</td>
                          <td className="px-3 py-2">{item.avatarReferenceCount}</td>
                          <td className="px-3 py-2">{item.backgroundReferenceCount}</td>
                          <td className="px-3 py-2">{item.faviconReferenceCount}</td>
                          <td className={`px-3 py-2 ${item.safeToDelete ? 'text-emerald-300' : 'text-amber-200'}`}>
                            {item.safeToDelete ? '可删除' : '有引用'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
