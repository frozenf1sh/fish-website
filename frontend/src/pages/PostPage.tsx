import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { clients } from '../lib/connect'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { MarkdownViewer } from '../components/MarkdownViewer'
import { showToast } from '../lib/toast'
import { compressImage } from '../utils/imageCompressor'

interface PostDetail {
  id: string
  content: string
  imageUrls: string[]
  createdAt?: { toDate?: () => Date }
  updatedAt?: { toDate?: () => Date }
}

const formatDate = (d?: { toDate?: () => Date }) => {
  if (!d?.toDate) return '刚刚'
  return d.toDate().toLocaleString('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function PostPage() {
  const { postId } = useParams()
  const navigate = useNavigate()

  const [post, setPost] = useState<PostDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [content, setContent] = useState('')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dragIndexRef = useRef<number | null>(null)

  useEffect(() => {
    let ignore = false
    const load = async () => {
      if (!postId) return
      setIsLoading(true)
      try {
        const response = await clients.post.getPost({ id: postId })
        const p = response.post as PostDetail | null
        if (!p || ignore) return
        setPost(p)
        setContent(p.content || '')
        setImageUrls(p.imageUrls || [])
      } catch (err) {
        console.error('load post failed', err)
        showToast({ type: 'error', message: '加载动态失败' })
      } finally {
        if (!ignore) setIsLoading(false)
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [postId])

  const shareUrl = typeof window === 'undefined' ? `/post/${postId}` : `${window.location.origin}/post/${postId}`

  const uploadWithRetry = async (url: string, file: File, headers: Record<string, string>, retries = 2) => {
    let lastError: unknown
    for (let i = 0; i <= retries; i += 1) {
      try {
        const res = await fetch(url, { method: 'PUT', body: file, headers })
        if (!res.ok) throw new Error(`upload failed ${res.status}`)
        return
      } catch (err) {
        lastError = err
      }
    }
    throw lastError
  }

  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (fileInputRef.current) fileInputRef.current.value = ''

    try {
      const appended: string[] = []
      for (const file of files) {
        const compressed = await compressImage(file)
        const req = await clients.album.uploadImageRequest({
          albumId: 'default',
          fileName: compressed.name,
          mimeType: compressed.type,
          fileSize: compressed.size,
        })
        const headers: Record<string, string> = typeof req.headers === 'object' ? { ...req.headers } : {}
        if (compressed.type && !headers['Content-Type']) headers['Content-Type'] = compressed.type
        await uploadWithRetry(req.uploadUrl, compressed, headers)
        const conf = await clients.album.confirmImageUpload({ imageId: req.imageId, uploadUrl: req.uploadUrl })
        if (conf.image?.url) appended.push(conf.image.url)
      }
      if (appended.length) {
        setImageUrls((prev) => [...prev, ...appended])
        showToast({ type: 'success', message: `已新增 ${appended.length} 张图片` })
      }
    } catch (err) {
      console.error('upload post images failed', err)
      showToast({ type: 'error', message: '上传图片失败' })
    }
  }

  const handleSave = async () => {
    if (!postId) return
    setIsSaving(true)
    try {
      const response = await clients.post.updatePost({
        id: postId,
        content,
        imageUrls,
      })
      const updated = response.post as PostDetail | null
      if (updated) {
        setPost(updated)
        setContent(updated.content)
        setImageUrls(updated.imageUrls || [])
      }
      setIsEditing(false)
      showToast({ type: 'success', message: '动态已更新' })
    } catch (err) {
      console.error('update post failed', err)
      showToast({ type: 'error', message: '保存失败，请重试' })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="glass-card rounded-4xl p-8 text-center text-white/70">
        <LoadingSpinner text="正在加载动态..." />
      </div>
    )
  }

  if (!post) {
    return <div className="glass-card rounded-4xl p-8 text-center text-white/70">动态不存在或已删除</div>
  }

  return (
    <div className="pb-8 px-3 sm:px-0">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-3xl sm:rounded-4xl p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap border-b border-white/15 pb-4">
          <div>
            <h2 className="text-white text-2xl font-bold">动态详情</h2>
            <p className="text-white/55 text-sm mt-1">发布于 {formatDate(post.createdAt)} · 更新于 {formatDate(post.updatedAt || post.createdAt)}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl)
                  showToast({ type: 'success', message: '分享链接已复制' })
                } catch {
                  showToast({ type: 'error', message: '复制失败' })
                }
              }}
              className="px-3 py-2 rounded-2xl border border-white/25 text-white/85 hover:bg-white/10"
            >
              复制链接
            </button>
            <button onClick={() => navigate('/')} className="px-3 py-2 rounded-2xl border border-white/25 text-white/85 hover:bg-white/10">返回首页</button>
          </div>
        </div>

        {!isEditing ? (
          <>
            <div className="text-white/90"><MarkdownViewer content={post.content} theme="dark" /></div>
            {post.imageUrls?.length ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {post.imageUrls.map((url, idx) => (
                  <img key={`${url}-${idx}`} src={url} alt={`post-${idx}`} className="w-full h-48 object-cover rounded-2xl border border-white/15" />
                ))}
              </div>
            ) : null}
            <div className="flex justify-end">
              <button onClick={() => setIsEditing(true)} className="px-4 py-2 rounded-2xl border border-white/25 text-white/85 hover:bg-white/10">编辑动态</button>
            </div>
          </>
        ) : (
          <>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full min-h-[140px] px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20"
            />

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex gap-2">
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUploadImages} />
                <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 rounded-xl border border-white/20 text-white/85 hover:bg-white/10">上传图片</button>
              </div>
              <p className="text-white/55 text-sm">拖拽图片卡片可调整顺序，点右上角可删除</p>
            </div>

            {imageUrls.length ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {imageUrls.map((url, idx) => (
                  <div
                    key={`${url}-${idx}`}
                    draggable
                    onDragStart={() => {
                      dragIndexRef.current = idx
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      const from = dragIndexRef.current
                      if (from === null || from === idx) return
                      setImageUrls((prev) => {
                        const next = [...prev]
                        const [moved] = next.splice(from, 1)
                        next.splice(idx, 0, moved)
                        return next
                      })
                      dragIndexRef.current = null
                    }}
                    className="relative"
                  >
                    <img src={url} alt={`edit-${idx}`} className="w-full h-48 object-cover rounded-2xl border border-white/15" />
                    <button
                      onClick={() => setImageUrls((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsEditing(false)
                  setContent(post.content)
                  setImageUrls(post.imageUrls || [])
                }}
                className="px-4 py-2 rounded-2xl border border-white/25 text-white/85 hover:bg-white/10"
              >
                取消
              </button>
              <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 rounded-2xl bg-white text-slate-900 hover:bg-white/90 disabled:opacity-50">
                {isSaving ? '保存中...' : '保存修改'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}
