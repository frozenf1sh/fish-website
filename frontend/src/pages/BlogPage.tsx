import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { clients } from '../lib/connect'
import { useStore } from '../store/useStore'
import { MarkdownViewer } from '../components/MarkdownViewer'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { BlogFolderTree } from '../components/BlogFolderTree'
import { ArticleReader } from '../components/ArticleReader'
import { showToast } from '../lib/toast'
import { compressImage } from '../utils/imageCompressor'
import { withTimeout } from '../shared/api/async'
import type { BlogArticle, FolderNode } from '../shared/domain/content'

type PreviewMode = 'split' | 'edit' | 'preview'
type ToolbarAction =
  | 'h1'
  | 'h2'
  | 'bold'
  | 'italic'
  | 'inlineCode'
  | 'link'
  | 'image'
  | 'ul'
  | 'ol'
  | 'codeBlock'
  | 'table'
  | 'quote'

const ROOT_FOLDER_ID = 'root'
const BLOG_LIST_TIMEOUT_MS = 15000

const formatDate = (d?: { toDate?: () => Date }) => {
  if (!d?.toDate) return '刚刚'
  return d.toDate().toLocaleString('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const isUpdatedAfterCreated = (article: BlogArticle) => {
  const created = article.createdAt?.toDate?.()
  const updated = article.updatedAt?.toDate?.()
  if (!created || !updated) return false
  return updated.getTime()-created.getTime() > 1000
}

const getArticlePreview = (value: string) => value
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/[`*_>#]/g, '')
  .replace(/\[|\]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 220)

export function BlogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { articleId } = useParams()
  const navigate = useNavigate()
  const isLoggedIn = useStore((state) => state.isLoggedIn)

  const folderId = searchParams.get('folder') || ROOT_FOLDER_ID
  const composeOpen = searchParams.get('compose') === '1'
  const editingArticleId = searchParams.get('edit') || ''

  const [articles, setArticles] = useState<BlogArticle[]>([])
  const [nextPageToken, setNextPageToken] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [folderTree, setFolderTree] = useState<FolderNode[]>([{ id: ROOT_FOLDER_ID, name: '根目录', children: [] }])

  const [sharedArticle, setSharedArticle] = useState<BlogArticle | null>(null)
  const [isLoadingShared, setIsLoadingShared] = useState(false)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('split')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null)
  const [editHistory, setEditHistory] = useState<{ items: string[]; index: number }>({ items: [''], index: 0 })

  const [manageMode, setManageMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [movePath, setMovePath] = useState<string[]>([ROOT_FOLDER_ID])
  const [isManaging, setIsManaging] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const articleRequestIdRef = useRef(0)

  const articleMap = useMemo(() => {
    const map = new Map<string, BlogArticle>()
    for (const item of articles) {
      map.set(item.id, item)
    }
    return map
  }, [articles])

  const getShareUrl = (id: string) => {
    if (typeof window === 'undefined') return `/blog/${id}`
    return `${window.location.origin}/blog/${id}`
  }

  const copyShareUrl = async (id: string) => {
    try {
      await navigator.clipboard.writeText(getShareUrl(id))
      showToast({ type: 'success', message: '分享链接已复制' })
    } catch {
      showToast({ type: 'error', message: '复制失败，请手动复制地址栏链接' })
    }
  }

  const normalizeFolders = (folders: FolderNode[]) => {
    if (!folders.length) {
      return [{ id: ROOT_FOLDER_ID, name: '根目录', children: [] }]
    }
    if (folders.some((f) => f.id === ROOT_FOLDER_ID)) {
      return folders
    }
    return [{ id: ROOT_FOLDER_ID, name: '根目录', children: folders }]
  }

  const getMoveLevels = () => {
    const levels: FolderNode[][] = []
    let level = 0
    let currentOptions = folderTree
    while (true) {
      const options = currentOptions
      if (options.length === 0) break
      levels.push(options)
      const selectedID = movePath[level] && options.some((item) => item.id === movePath[level]) ? movePath[level] : options[0].id
      const selected = options.find((item) => item.id === selectedID)
      currentOptions = selected?.children || []
      level += 1
      if (level > 16) break
    }
    return levels
  }

  const getResolvedMovePath = () => {
    const resolved: string[] = []
    let currentOptions = folderTree
    for (let level = 0; level < 16; level += 1) {
      if (!currentOptions.length) break
      const selectedID = movePath[level] && currentOptions.some((item) => item.id === movePath[level]) ? movePath[level] : currentOptions[0].id
      resolved.push(selectedID)
      const selected = currentOptions.find((item) => item.id === selectedID)
      currentOptions = selected?.children || []
    }
    return resolved
  }

  const resetComposer = () => {
    setTitle('')
    setContent('')
    setTagsInput('')
    setPreviewMode('split')
    setEditHistory({ items: [''], index: 0 })
  }

  const loadArticles = async (options?: { reset?: boolean; pageToken?: string }) => {
    const reset = options?.reset ?? false
    const requestPageToken = options?.pageToken ?? ''
    const requestId = ++articleRequestIdRef.current

    if (reset) {
      setIsLoading(true)
      setError(null)
    } else {
      setIsLoadingMore(true)
    }

    try {
      const listPromise = clients.blog.listArticles({
        pageSize: 20,
        pageToken: requestPageToken,
        folderId,
        status: 'published',
      })
      const response = await withTimeout(listPromise, BLOG_LIST_TIMEOUT_MS, 'BLOG_LIST_TIMEOUT')
      if (requestId !== articleRequestIdRef.current) return

      const newArticles = (response.articles || []) as BlogArticle[]
      setFolderTree(normalizeFolders((response.folders || []) as FolderNode[]))
      setArticles((prev) => (reset ? newArticles : [...prev, ...newArticles]))
      setNextPageToken(response.nextPageToken || '')
      setHasMore(!!response.hasMore)
      setError(null)
    } catch (err) {
      console.error('Failed to load blog articles:', err)
      const message = err instanceof Error && err.message === 'BLOG_LIST_TIMEOUT' ? '加载超时，请点击重试或刷新页面' : '加载博客失败，请稍后重试'
      setError(message)
      if (reset) {
        setArticles([])
        setNextPageToken('')
        setHasMore(false)
      }
    } finally {
      if (requestId === articleRequestIdRef.current) {
        if (reset) {
          setIsLoading(false)
        } else {
          setIsLoadingMore(false)
        }
      }
    }
  }

  useEffect(() => {
    if (articleId) return
    if (!searchParams.get('folder')) {
      const next = new URLSearchParams(searchParams)
      next.set('folder', ROOT_FOLDER_ID)
      setSearchParams(next, { replace: true })
    }
    loadArticles({ reset: true, pageToken: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, folderId])

  useEffect(() => {
    if (manageMode) {
      setMovePath([ROOT_FOLDER_ID])
    }
  }, [folderId, manageMode])

  useEffect(() => {
    if (!composeOpen || !editingArticleId || !isLoggedIn) return

    let cancelled = false
    const loadEditingArticle = async () => {
      try {
        const response = await clients.blog.getArticle({ articleId: editingArticleId })
        const article = response.article as BlogArticle | null
        if (!article || cancelled) return
        setTitle(article.title || '')
        setContent(article.content || '')
        setTagsInput((article.tags || []).join(', '))
        setEditHistory({ items: [article.content || ''], index: 0 })
      } catch (err) {
        console.error('Failed to load editing article:', err)
        showToast({ type: 'error', message: '加载待编辑文章失败' })
      }
    }
    loadEditingArticle()

    return () => {
      cancelled = true
    }
  }, [composeOpen, editingArticleId, isLoggedIn])

  useEffect(() => {
    if (!articleId) {
      setSharedArticle(null)
      return
    }

    const load = async () => {
      setIsLoadingShared(true)
      try {
        const response = await clients.blog.getArticle({ articleId })
        setSharedArticle((response.article as BlogArticle) || null)
      } catch (err) {
        console.error('Failed to load article:', err)
        setSharedArticle(null)
      } finally {
        setIsLoadingShared(false)
      }
    }

    load()
  }, [articleId])

  const applyEditorChange = (next: string, selection?: { start: number; end: number }) => {
    setContent(next)
    setEditHistory((prev) => {
      const base = prev.items.slice(0, prev.index + 1)
      if (base[base.length - 1] === next) {
        return prev
      }
      const nextItems = [...base, next]
      const limit = 120
      if (nextItems.length > limit) {
        const trimmed = nextItems.slice(nextItems.length - limit)
        return { items: trimmed, index: trimmed.length - 1 }
      }
      return { items: nextItems, index: nextItems.length - 1 }
    })

    const el = textareaRef.current
    if (el && selection) {
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(selection.start, selection.end)
      })
    }
  }

  const wrapSelection = (marker: string) => {
    const el = textareaRef.current
    if (!el) {
      const fallback = `${content}${marker}${marker}`
      applyEditorChange(fallback)
      return
    }

    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = content.slice(start, end)
    const beforeChar = content[start - 1] || ''
    const afterChar = content[end] || ''
    const needLeadingSpace = start > 0 && !/\s/.test(beforeChar)
    const needTrailingSpace = end < content.length && !/\s/.test(afterChar)

    const leading = needLeadingSpace ? ' ' : ''
    const trailing = needTrailingSpace ? ' ' : ''

    const wrapped = `${leading}${marker}${selected}${marker}${trailing}`
    const next = `${content.slice(0, start)}${wrapped}${content.slice(end)}`

    if (selected.length > 0) {
      const selectionStart = start + leading.length + marker.length
      const selectionEnd = selectionStart + selected.length
      applyEditorChange(next, { start: selectionStart, end: selectionEnd })
      return
    }

    const cursor = start + leading.length + marker.length
    applyEditorChange(next, { start: cursor, end: cursor })
  }

  const insertSnippet = (snippet: string, cursorOffset?: number) => {
    const el = textareaRef.current
    if (!el) {
      const fallback = `${content}\n${snippet}`
      applyEditorChange(fallback)
      return
    }

    const start = el.selectionStart
    const end = el.selectionEnd
    const next = `${content.slice(0, start)}${snippet}${content.slice(end)}`
    const cursor = start + (cursorOffset ?? snippet.length)
    applyEditorChange(next, { start: cursor, end: cursor })
  }

  const applyToolbarAction = (action: ToolbarAction) => {
    switch (action) {
      case 'h1':
        insertSnippet('# ')
        return
      case 'h2':
        insertSnippet('## ')
        return
      case 'bold':
        wrapSelection('**')
        return
      case 'italic':
        wrapSelection('*')
        return
      case 'inlineCode':
        wrapSelection('`')
        return
      case 'link':
        insertSnippet('[]()', 1)
        return
      case 'image':
        insertSnippet('![]()', 2)
        return
      case 'ul':
        insertSnippet('- ')
        return
      case 'ol':
        insertSnippet('1. ')
        return
      case 'codeBlock':
        insertSnippet('```\n\n```', 4)
        return
      case 'table':
        insertSnippet('|  |  |\n| --- | --- |\n|  |  |\n', 2)
        return
      case 'quote':
        insertSnippet('> ')
        return
      default:
        return
    }
  }

  const handleUndo = () => {
    setEditHistory((prev) => {
      if (prev.index <= 0) return prev
      const nextIndex = prev.index - 1
      setContent(prev.items[nextIndex])
      return { ...prev, index: nextIndex }
    })
  }

  const handleRedo = () => {
    setEditHistory((prev) => {
      if (prev.index >= prev.items.length - 1) return prev
      const nextIndex = prev.index + 1
      setContent(prev.items[nextIndex])
      return { ...prev, index: nextIndex }
    })
  }

  const smartWrapSelectedWithMarker = (marker: '*' | '`') => {
    const el = textareaRef.current
    if (!el) return

    const start = el.selectionStart
    const end = el.selectionEnd
    if (start === end) return

    const selected = content.slice(start, end)

    const countMarkerLeft = () => {
      let count = 0
      for (let i = start - 1; i >= 0 && count < 3; i -= 1) {
        if (content[i] !== marker) break
        count += 1
      }
      return count
    }

    const countMarkerRight = () => {
      let count = 0
      for (let i = end; i < content.length && count < 3; i += 1) {
        if (content[i] !== marker) break
        count += 1
      }
      return count
    }

    const leftCount = countMarkerLeft()
    const rightCount = countMarkerRight()
    const surroundCount = Math.min(leftCount, rightCount)

    if (marker === '`' && surroundCount >= 2) {
      const replaceStart = start - surroundCount
      const replaceEnd = end + surroundCount
      const block = `\`\`\`\n${selected}\n\`\`\``
      const next = `${content.slice(0, replaceStart)}${block}${content.slice(replaceEnd)}`
      const selectionStart = replaceStart + 4
      const selectionEnd = selectionStart + selected.length
      applyEditorChange(next, { start: selectionStart, end: selectionEnd })
      return
    }

    if (surroundCount > 0) {
      const next = `${content.slice(0, start)}${marker}${selected}${marker}${content.slice(end)}`
      const selectionStart = start + 1
      const selectionEnd = selectionStart + selected.length
      applyEditorChange(next, { start: selectionStart, end: selectionEnd })
      return
    }

    const beforeChar = content[start - 1] || ''
    const afterChar = content[end] || ''
    const needLeadingSpace = start > 0 && !/\s/.test(beforeChar)
    const needTrailingSpace = end < content.length && !/\s/.test(afterChar)

    const leading = needLeadingSpace ? ' ' : ''
    const trailing = needTrailingSpace ? ' ' : ''
    const wrapped = `${leading}${marker}${selected}${marker}${trailing}`
    const next = `${content.slice(0, start)}${wrapped}${content.slice(end)}`
    const selectionStart = start + leading.length + 1
    const selectionEnd = selectionStart + selected.length
    applyEditorChange(next, { start: selectionStart, end: selectionEnd })
  }

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
    if (!isDesktop) return

    const el = e.currentTarget
    const hasSelection = el.selectionStart !== el.selectionEnd
    const key = e.key.toLowerCase()

    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
        return
      }
      if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault()
        handleRedo()
        return
      }

      if ((key === 'c' || key === 'x') && !hasSelection) {
        const cursor = el.selectionStart
        const lineStart = content.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1
        const lineEndRaw = content.indexOf('\n', cursor)
        const lineEnd = lineEndRaw === -1 ? content.length : lineEndRaw
        const lineText = content.slice(lineStart, lineEnd)
        const withNewline = lineEndRaw === -1 ? lineText : `${lineText}\n`

        e.preventDefault()
        void navigator.clipboard.writeText(withNewline)

        if (key === 'x') {
          const removeStart = lineEndRaw === -1 && lineStart > 0 ? lineStart - 1 : lineStart
          const removeEnd = lineEndRaw === -1 ? lineEnd : lineEnd + 1
          const next = `${content.slice(0, removeStart)}${content.slice(removeEnd)}`
          applyEditorChange(next, { start: removeStart, end: removeStart })
        }
        return
      }
    }

    if (!e.ctrlKey && !e.metaKey && !e.altKey && hasSelection) {
      if (e.key === '*') {
        e.preventDefault()
        smartWrapSelectedWithMarker('*')
        return
      }
      if (e.key === '`') {
        e.preventDefault()
        smartWrapSelectedWithMarker('`')
        return
      }
    }
  }

  const uploadWithRetry = async (url: string, file: File, headers: Record<string, string>, retries = 2) => {
    let lastError: unknown
    for (let i = 0; i <= retries; i += 1) {
      try {
        const response = await fetch(url, {
          method: 'PUT',
          headers,
          body: file,
        })
        if (!response.ok) {
          throw new Error(`upload failed with status ${response.status}`)
        }
        return
      } catch (err) {
        lastError = err
      }
    }
    throw lastError
  }

  const ensureDefaultAlbumId = async () => {
    const albums = await clients.album.listAlbums({ pageSize: 100, onlyPublic: false })
    const matched = (albums.albums || []).find((item) => item.name === '默认相册' || item.id === 'default')
    if (matched?.id) return matched.id

    const created = await clients.album.createAlbum({
      name: '默认相册',
      description: '博客图片自动上传',
      isPublic: false,
    })
    if (!created.album?.id) {
      throw new Error('default album create failed')
    }
    return created.album.id
  }

  const handleInsertUploadedImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (imageUploadInputRef.current) {
      imageUploadInputRef.current.value = ''
    }

    try {
      showToast({ type: 'info', message: '图片上传中...' })
      const compressed = await compressImage(file)
      const albumId = await ensureDefaultAlbumId()
      const uploadReq = await clients.album.uploadImageRequest({
        albumId,
        fileName: compressed.name,
        mimeType: compressed.type,
        fileSize: compressed.size,
      })

      const headers: Record<string, string> = typeof uploadReq.headers === 'object' ? { ...uploadReq.headers } : {}
      if (compressed.type && !headers['Content-Type']) {
        headers['Content-Type'] = compressed.type
      }
      await uploadWithRetry(uploadReq.uploadUrl, compressed, headers)

      const confirmed = await clients.album.confirmImageUpload({
        imageId: uploadReq.imageId,
        uploadUrl: uploadReq.uploadUrl,
      })
      const imageUrl = confirmed.image?.url
      if (!imageUrl) {
        throw new Error('upload confirm failed')
      }

      const markdown = `\n![${file.name}](${imageUrl})\n`
      insertSnippet(markdown)
      showToast({ type: 'success', message: '图片已上传并插入' })
    } catch (err) {
      console.error('insert uploaded image failed', err)
      showToast({ type: 'error', message: '上传图片失败，请重试' })
    }
  }

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) {
      showToast({ type: 'warning', message: '请先填写标题和正文内容' })
      return
    }

    setIsPublishing(true)
    try {
      const tags = tagsInput.split(',').map((item) => item.trim()).filter(Boolean)
      let targetID = editingArticleId
      if (editingArticleId) {
        await clients.blog.updateArticle({
          articleId: editingArticleId,
          title: title.trim(),
          content: content.trim(),
          folderId,
          tags,
          status: 'published',
        })
      } else {
        const created = await clients.blog.createArticle({
          title: title.trim(),
          content: content.trim(),
          folderId,
          tags,
          status: 'published',
        })
        targetID = created.article?.id || ''
        if (targetID) {
          try {
            await clients.post.createPost({
              content: `📝 发布了新博客：**${title.trim()}**\n\n${getArticlePreview(content) || '一篇新的博客文章已经发布。'}\n\n[点击阅读](${getShareUrl(targetID)})`,
              imageIds: [],
            })
          } catch (timelineErr) {
            console.warn('sync blog publish to timeline failed', timelineErr)
          }
        }
      }

      resetComposer()
      window.dispatchEvent(new Event('blog:updated'))
      if (targetID) {
        navigate(`/blog/${targetID}`)
      } else {
        await loadArticles({ reset: true, pageToken: '' })
      }
      showToast({ type: 'success', message: editingArticleId ? '文章已更新' : '文章已创建' })
    } catch (err) {
      console.error('Failed to save article:', err)
      showToast({ type: 'error', message: editingArticleId ? '更新文章失败，请重试' : '创建文章失败，请重试' })
    } finally {
      setIsPublishing(false)
    }
  }

  const toggleArticleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return

    setIsManaging(true)
    try {
      await Promise.all(selectedIds.map((id) => clients.blog.deleteArticle({ articleId: id })))
      setSelectedIds([])
      await loadArticles({ reset: true, pageToken: '' })
      window.dispatchEvent(new Event('blog:updated'))
      showToast({ type: 'success', message: `已删除 ${selectedIds.length} 篇文章` })
    } catch (err) {
      console.error('Failed to delete selected articles:', err)
      showToast({ type: 'error', message: '删除失败，请重试' })
    } finally {
      setIsManaging(false)
    }
  }

  const requestDeleteSelected = () => {
    if (selectedIds.length === 0) return
    setConfirmDeleteOpen(true)
  }

  const moveSelectedToFolder = async () => {
    if (selectedIds.length === 0) return
    const resolvedPath = getResolvedMovePath()
    const targetFolderId = resolvedPath[resolvedPath.length - 1] || ROOT_FOLDER_ID

    setIsManaging(true)
    try {
      await Promise.all(
        selectedIds.map(async (id) => {
          const article = articleMap.get(id)
          if (!article) return
          await clients.blog.updateArticle({
            articleId: article.id,
            title: article.title,
            content: article.content,
            folderId: targetFolderId,
            tags: article.tags,
            status: article.status,
          })
        }),
      )

      setSelectedIds([])
      await loadArticles({ reset: true, pageToken: '' })
      window.dispatchEvent(new Event('blog:updated'))
      showToast({ type: 'success', message: '文章已移动到所选目录' })
    } catch (err) {
      console.error('Failed to move selected articles:', err)
      showToast({ type: 'error', message: '移动失败，请重试' })
    } finally {
      setIsManaging(false)
    }
  }

  if (articleId) {
    return (
      <div className="pb-8 px-3 sm:px-0">
        {isLoadingShared ? (
          <div className="glass-card rounded-4xl p-8 text-center text-white/70">
            <LoadingSpinner text="正在加载文章..." />
          </div>
        ) : !sharedArticle ? (
          <div className="glass-card rounded-4xl p-8 text-center text-white/70">文章不存在或已删除</div>
        ) : (
          <ArticleReader
            article={sharedArticle}
            actions={(
              <>
                <button onClick={() => copyShareUrl(sharedArticle.id)} className="px-3 py-2 rounded-2xl border border-slate-300 text-slate-700 hover:bg-slate-100">复制链接</button>
                <button onClick={() => navigate('/blog')} className="px-3 py-2 rounded-2xl border border-slate-300 text-slate-700 hover:bg-slate-100">返回列表</button>
              </>
            )}
          />
        )}
      </div>
    )
  }

  if (isLoggedIn && composeOpen) {
    const toolbar = [
      { label: 'H1', action: 'h1' as ToolbarAction },
      { label: 'H2', action: 'h2' as ToolbarAction },
      { label: '粗体', action: 'bold' as ToolbarAction },
      { label: '斜体', action: 'italic' as ToolbarAction },
      { label: '行内代码', action: 'inlineCode' as ToolbarAction },
      { label: '链接', action: 'link' as ToolbarAction },
      { label: '图片', action: 'image' as ToolbarAction },
      { label: '无序列表', action: 'ul' as ToolbarAction },
      { label: '有序列表', action: 'ol' as ToolbarAction },
      { label: '代码块', action: 'codeBlock' as ToolbarAction },
      { label: '表格', action: 'table' as ToolbarAction },
      { label: '引用', action: 'quote' as ToolbarAction },
    ]

    return (
      <div className="pb-8 px-0 sm:px-0">
        <form onSubmit={handlePublish} className="bg-white text-slate-900 rounded-3xl border border-slate-200 shadow-xl min-h-[80vh] overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">{editingArticleId ? '编辑文章' : '新建文章'}</h2>
                <span className="text-xs px-2 py-1 rounded-full bg-slate-200 text-slate-700">实时预览</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={editHistory.index <= 0}
                  className="px-2.5 py-1.5 text-sm rounded-xl bg-slate-200 text-slate-700 disabled:opacity-40"
                >
                  撤回
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={editHistory.index >= editHistory.items.length - 1}
                  className="px-2.5 py-1.5 text-sm rounded-xl bg-slate-200 text-slate-700 disabled:opacity-40"
                >
                  重做
                </button>
                <button type="button" onClick={() => setPreviewMode('edit')} className={`px-2.5 py-1.5 text-sm rounded-xl ${previewMode === 'edit' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>编辑</button>
                <button type="button" onClick={() => setPreviewMode('preview')} className={`px-2.5 py-1.5 text-sm rounded-xl ${previewMode === 'preview' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>预览</button>
                <button type="button" onClick={() => setPreviewMode('split')} className={`px-2.5 py-1.5 text-sm rounded-xl ${previewMode === 'split' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>分栏</button>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-3 mt-4">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="文章标题" className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white" />
              <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="标签，逗号分隔" className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white" />
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                onClick={() => imageUploadInputRef.current?.click()}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 hover:bg-slate-100"
              >
                上传图片
              </button>
              {toolbar.map((item) => (
                <button key={item.label} type="button" onClick={() => applyToolbarAction(item.action)} className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 hover:bg-slate-100">
                  {item.label}
                </button>
              ))}
            </div>
            <input
              ref={imageUploadInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleInsertUploadedImage}
            />
          </div>

          <div className={`min-h-[56vh] ${previewMode === 'split' ? 'grid lg:grid-cols-2' : 'grid grid-cols-1'}`}>
            {(previewMode === 'edit' || previewMode === 'split') && (
              <div className={previewMode === 'split' ? 'border-r border-slate-200' : ''}>
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => applyEditorChange(e.target.value)}
                  onKeyDown={handleEditorKeyDown}
                  placeholder="在这里编写 Markdown..."
                  className="w-full h-full min-h-[56vh] p-4 sm:p-5 resize-none focus:outline-none font-mono text-[14px] leading-6"
                />
              </div>
            )}

            {(previewMode === 'preview' || previewMode === 'split') && (
              <div className="bg-slate-50 min-h-[56vh] p-4 sm:p-5 overflow-auto">
                <MarkdownViewer theme="light" content={content || '### 预览区域\n\n开始输入 Markdown 内容...'} />
              </div>
            )}
          </div>

          <div className="px-4 sm:px-6 py-4 border-t border-slate-200 flex justify-end gap-3 bg-slate-50">
            <button
              type="button"
              onClick={() => {
                resetComposer()
                const next = new URLSearchParams(searchParams)
                next.delete('compose')
                next.delete('edit')
                setSearchParams(next)
              }}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-200"
            >
              取消
            </button>
            <button type="submit" disabled={isPublishing} className="px-5 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
              {isPublishing ? (editingArticleId ? '更新中...' : '创建中...') : (editingArticleId ? '保存修改' : '发布文章')}
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-8 px-3 sm:px-0">
      <div className="lg:hidden">
        <BlogFolderTree />
      </div>

      {isLoggedIn && (
        <div className="flex justify-end gap-2">
          <button
            onClick={() => {
              setManageMode((prev) => !prev)
              setSelectedIds([])
            }}
            className={`px-4 py-2 rounded-2xl border ${manageMode ? 'bg-white/25 text-white border-white/40' : 'border-white/25 text-white/85 hover:bg-white/10'}`}
          >
            博客管理
          </button>
          <button
            onClick={() => {
              resetComposer()
              const next = new URLSearchParams(searchParams)
              next.set('compose', '1')
              next.delete('edit')
              setSearchParams(next)
            }}
            className="btn-primary px-4 py-2 rounded-2xl text-white"
          >
            新建文章
          </button>
        </div>
      )}

      {isLoggedIn && manageMode && (
        <div className="glass-card rounded-3xl sm:rounded-4xl p-4 sm:p-6 space-y-3">
          <p className="text-white/85 text-sm">已选中 {selectedIds.length} 篇文章</p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {getMoveLevels().map((options, index) => (
                (() => {
                  const safeValue = movePath[index] && options.some((node) => node.id === movePath[index])
                    ? movePath[index]
                    : options[0]?.id || ''
                  return (
                <select
                  key={`folder-level-${index}`}
                  value={safeValue}
                  onChange={(e) => {
                    const selected = e.target.value
                    setMovePath((prev) => [...prev.slice(0, index), selected])
                  }}
                  className="min-w-[140px] px-3 py-2 rounded-xl bg-white/10 text-white border border-white/20"
                >
                  {options.map((node) => (
                    <option key={node.id} value={node.id} className="text-slate-900">
                      {node.name}
                    </option>
                  ))}
                </select>
                  )
                })()
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={moveSelectedToFolder} disabled={isManaging || selectedIds.length === 0} className="px-4 py-2 rounded-2xl border border-white/30 text-white hover:bg-white/10 disabled:opacity-50">移动到所选文件夹</button>
              <button onClick={requestDeleteSelected} disabled={isManaging || selectedIds.length === 0} className="px-4 py-2 rounded-2xl border border-red-300/40 text-red-100 bg-red-500/20 hover:bg-red-500/35 disabled:opacity-50">删除所选</button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="glass-card rounded-4xl p-8 text-center text-white/70">
          <LoadingSpinner text="正在加载博客..." />
        </div>
      ) : error ? (
        <div className="glass-card rounded-4xl p-8 text-center text-red-200 space-y-4">
          <p>{error}</p>
          <button
            onClick={() => loadArticles({ reset: true, pageToken: '' })}
            className="px-4 py-2 rounded-2xl border border-white/30 text-white hover:bg-white/10"
          >
            重试加载
          </button>
        </div>
      ) : articles.length === 0 ? (
        <div className="glass-card rounded-4xl p-10 text-center text-white/60">
          <p className="text-5xl mb-3">📝</p>
          <p>当前文件夹下暂无文章</p>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {articles.map((article, index) => (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              onClick={() => {
                if (isLoggedIn && manageMode) {
                  toggleArticleSelected(article.id)
                  return
                }
                navigate(`/blog/${article.id}`)
              }}
              className={`w-full text-left glass-card rounded-3xl sm:rounded-4xl p-4 sm:p-6 cursor-pointer border transition-all ${selectedIds.includes(article.id) ? 'border-sky-300 ring-2 ring-sky-300/60' : 'border-transparent hover:border-white/20'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-left flex-1">
                  <h3 className="text-white text-lg sm:text-xl font-semibold mb-2">{article.title}</h3>
                  <p className="text-white/65 text-sm mb-3 line-clamp-2 break-all [overflow-wrap:anywhere]">{article.content.replace(/#+\s?.*\n/g, '').trim()}</p>
                </div>
                <div className="flex items-center gap-2">
                  {isLoggedIn && manageMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const next = new URLSearchParams(searchParams)
                        next.set('compose', '1')
                        next.set('edit', article.id)
                        next.set('folder', article.folderId || ROOT_FOLDER_ID)
                        setSearchParams(next)
                      }}
                      className="px-3 py-1.5 rounded-xl border border-white/25 text-white/85 hover:bg-white/10"
                    >
                      编辑
                    </button>
                  )}
                  {!manageMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        copyShareUrl(article.id)
                      }}
                      className="px-3 py-1.5 rounded-xl border border-white/25 text-white/85 hover:bg-white/10"
                    >
                      复制链接
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex gap-2 flex-wrap">
                  {(article.tags || []).map((tag) => (
                    <span key={`${article.id}-${tag}`} className="px-2 py-1 rounded-full text-xs bg-white/15 text-white/70">#{tag}</span>
                  ))}
                </div>
                <span className="text-white/45 text-sm">
                  创建于 {formatDate(article.createdAt)}
                  {isUpdatedAfterCreated(article) ? ` · 修改于 ${formatDate(article.updatedAt)}` : ''}
                </span>
              </div>
            </motion.div>
          ))}

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button onClick={() => loadArticles({ reset: false, pageToken: nextPageToken })} disabled={isLoadingMore} className="px-5 py-2.5 rounded-2xl border border-white/25 text-white/85 hover:text-white hover:bg-white/10 disabled:opacity-50">
                {isLoadingMore ? '加载中...' : '加载更多'}
              </button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="删除博客"
        message={`确定删除已选 ${selectedIds.length} 篇文章吗？此操作不可恢复。`}
        confirmText="确认删除"
        cancelText="取消"
        danger
        loading={isManaging}
        onCancel={() => {
          if (isManaging) return
          setConfirmDeleteOpen(false)
        }}
        onConfirm={async () => {
          await deleteSelected()
          setConfirmDeleteOpen(false)
        }}
      />
    </div>
  )
}
