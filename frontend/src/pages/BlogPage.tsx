import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { clients } from '../lib/connect'
import { useStore } from '../store/useStore'
import { MarkdownViewer } from '../components/MarkdownViewer'
import { LoadingSpinner } from '../components/LoadingSpinner'

interface BlogArticle {
  id: string
  title: string
  content: string
  folderId: string
  tags: string[]
  status: 'draft' | 'published'
  createdAt?: { toDate?: () => Date }
  updatedAt?: { toDate?: () => Date }
}

interface BlogFolder {
  id: string
  name: string
  parentFolderId?: string
  children?: BlogFolder[]
}

type PreviewMode = 'split' | 'edit' | 'preview'

const formatDate = (d?: { toDate?: () => Date }) => {
  if (!d?.toDate) return '刚刚'
  return d.toDate().toLocaleString('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function BlogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { articleId } = useParams()
  const navigate = useNavigate()
  const isLoggedIn = useStore((state) => state.isLoggedIn)

  const folderId = searchParams.get('folder') || ''
  const selectedTag = searchParams.get('tag') || ''
  const articleIdFromQuery = searchParams.get('article') || ''
  const selectedStatus = (searchParams.get('status') || 'published') as 'draft' | 'published'
  const composeOpen = searchParams.get('compose') === '1'

  const [articles, setArticles] = useState<BlogArticle[]>([])
  const [folders, setFolders] = useState<BlogFolder[]>([])
  const [nextPageToken, setNextPageToken] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [sharedArticle, setSharedArticle] = useState<BlogArticle | null>(null)
  const [isLoadingShared, setIsLoadingShared] = useState(false)

  const [editingArticleId, setEditingArticleId] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [folderInput, setFolderInput] = useState('')
  const [publishAs, setPublishAs] = useState<'draft' | 'published'>('published')
  const [isPublishing, setIsPublishing] = useState(false)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('split')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderParentId, setNewFolderParentId] = useState('')
  const [moveFolderId, setMoveFolderId] = useState('')
  const [moveToParentId, setMoveToParentId] = useState('')
  const [isMutatingFolder, setIsMutatingFolder] = useState(false)

  const flattenFolders = (nodes: BlogFolder[]): BlogFolder[] =>
    nodes.flatMap((node) => [node, ...flattenFolders(node.children || [])])

  const flatFolders = useMemo(() => flattenFolders(folders), [folders])

  const availableTags = useMemo(() => {
    const set = new Set<string>()
    for (const article of articles) {
      for (const tag of article.tags || []) {
        if (tag) set.add(tag)
      }
    }
    return Array.from(set)
  }, [articles])

  const selectedFolderName = useMemo(() => {
    if (!folderId) return '全部文件夹'
    return flatFolders.find((folder) => folder.id === folderId)?.name || '未知文件夹'
  }, [flatFolders, folderId])

  const getShareUrl = (id: string) => {
    if (typeof window === 'undefined') return `/blog/${id}`
    return `${window.location.origin}/blog/${id}`
  }

  const copyShareUrl = async (id: string) => {
    try {
      await navigator.clipboard.writeText(getShareUrl(id))
      alert('分享链接已复制')
    } catch {
      alert('复制失败，请手动复制地址栏链接')
    }
  }

  const loadArticles = async (options?: { reset?: boolean; pageToken?: string }) => {
    const reset = options?.reset ?? false
    const requestPageToken = options?.pageToken ?? ''

    if (reset) {
      setIsLoading(true)
      setError(null)
    } else {
      setIsLoadingMore(true)
    }

    try {
      const response = await clients.blog.listArticles({
        pageSize: 20,
        pageToken: requestPageToken,
        folderId,
        tag: selectedTag,
        status: selectedStatus,
      })

      const newArticles = (response.articles || []) as BlogArticle[]
      setArticles((prev) => (reset ? newArticles : [...prev, ...newArticles]))
      setFolders((response.folders || []) as BlogFolder[])
      setNextPageToken(response.nextPageToken || '')
      setHasMore(!!response.hasMore)
      setError(null)
    } catch (err) {
      console.error('Failed to load blog articles:', err)
      setError('加载博客失败，请稍后重试')
      if (reset) {
        setArticles([])
        setNextPageToken('')
        setHasMore(false)
      }
    } finally {
      if (reset) {
        setIsLoading(false)
      } else {
        setIsLoadingMore(false)
      }
    }
  }

  useEffect(() => {
    if (articleIdFromQuery && !articleId) {
      navigate(`/blog/${articleIdFromQuery}`, { replace: true })
      return
    }
    if (articleId) return
    loadArticles({ reset: true, pageToken: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, selectedTag, selectedStatus, articleId, articleIdFromQuery])

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
        console.error('Failed to load shared article:', err)
        setSharedArticle(null)
      } finally {
        setIsLoadingShared(false)
      }
    }

    load()
  }, [articleId])

  const resetComposer = () => {
    setEditingArticleId('')
    setTitle('')
    setContent('')
    setTagsInput('')
    setFolderInput('')
    setPublishAs(selectedStatus === 'draft' ? 'draft' : 'published')
    setPreviewMode('split')
  }

  const insertSnippet = (snippet: string) => {
    const el = textareaRef.current
    if (!el) {
      setContent((prev) => `${prev}\n${snippet}`)
      return
    }

    const start = el.selectionStart
    const end = el.selectionEnd
    const next = `${content.slice(0, start)}${snippet}${content.slice(end)}`
    setContent(next)

    requestAnimationFrame(() => {
      el.focus()
      const cursor = start + snippet.length
      el.setSelectionRange(cursor, cursor)
    })
  }

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return

    setIsPublishing(true)
    try {
      const tags = tagsInput
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)

      const isEditing = !!editingArticleId
      let savedId = editingArticleId

      if (isEditing) {
        const updated = await clients.blog.updateArticle({
          articleId: editingArticleId,
          title: title.trim(),
          content: content.trim(),
          folderId: folderInput.trim(),
          tags,
          status: publishAs,
        })
        savedId = updated.article?.id || savedId
      } else {
        const created = await clients.blog.createArticle({
          title: title.trim(),
          content: content.trim(),
          folderId: folderInput.trim(),
          tags,
          status: publishAs,
        })
        savedId = created.article?.id || ''
      }

      resetComposer()
      window.dispatchEvent(new Event('blog:updated'))

      if (savedId) {
        navigate(`/blog/${savedId}`)
        alert(isEditing ? '文章已更新，可通过独立链接分享' : '文章已创建，可通过独立链接分享')
        return
      }

      const next = new URLSearchParams(searchParams)
      next.set('status', publishAs)
      if (folderInput.trim()) {
        next.set('folder', folderInput.trim())
      }
      next.delete('compose')
      setSearchParams(next)
      await loadArticles({ reset: true, pageToken: '' })
      alert(isEditing ? '文章已更新' : '文章已创建')
    } catch (err) {
      console.error('Failed to publish article:', err)
      const message = err instanceof Error ? err.message : '未知错误'
      alert(`保存文章失败：${message}`)
    } finally {
      setIsPublishing(false)
    }
  }

  const handleDelete = async (articleIdToDelete: string) => {
    if (!window.confirm('确认删除这篇文章吗？')) return
    try {
      await clients.blog.deleteArticle({ articleId: articleIdToDelete })
      setArticles((prev) => prev.filter((item) => item.id !== articleIdToDelete))
      window.dispatchEvent(new Event('blog:updated'))
    } catch (err) {
      console.error('Failed to delete article:', err)
      alert('删除失败，请稍后重试')
    }
  }

  const openEditor = (article: BlogArticle) => {
    setEditingArticleId(article.id)
    setTitle(article.title)
    setContent(article.content)
    setTagsInput((article.tags || []).join(','))
    setFolderInput(article.folderId || '')
    setPublishAs(article.status || 'published')

    const next = new URLSearchParams(searchParams)
    next.set('compose', '1')
    setSearchParams(next)
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    setIsMutatingFolder(true)
    try {
      await clients.blog.createFolder({
        name: newFolderName.trim(),
        parentFolderId: newFolderParentId,
      })
      setNewFolderName('')
      setNewFolderParentId('')
      await loadArticles({ reset: true, pageToken: '' })
      window.dispatchEvent(new Event('blog:updated'))
    } catch (err) {
      console.error('Failed to create folder:', err)
      alert('创建文件夹失败')
    } finally {
      setIsMutatingFolder(false)
    }
  }

  const handleMoveFolder = async () => {
    if (!moveFolderId) return
    const current = flatFolders.find((item) => item.id === moveFolderId)
    if (!current) return
    if (moveFolderId === moveToParentId) {
      alert('文件夹不能移动到自己下面')
      return
    }

    setIsMutatingFolder(true)
    try {
      await clients.blog.updateFolder({
        folderId: current.id,
        name: current.name,
        parentFolderId: moveToParentId,
      })
      setMoveFolderId('')
      setMoveToParentId('')
      await loadArticles({ reset: true, pageToken: '' })
      window.dispatchEvent(new Event('blog:updated'))
    } catch (err) {
      console.error('Failed to move folder:', err)
      alert('调整层级失败')
    } finally {
      setIsMutatingFolder(false)
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
          <div className="glass-panel rounded-3xl sm:rounded-4xl p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 flex-wrap pb-4 border-b border-white/15">
              <div>
                <h1 className="text-white text-2xl sm:text-3xl font-bold">{sharedArticle.title}</h1>
                <p className="text-white/55 text-sm mt-1">{formatDate(sharedArticle.updatedAt || sharedArticle.createdAt)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => copyShareUrl(sharedArticle.id)}
                  className="px-3 py-2 rounded-2xl border border-white/25 text-white/85 hover:bg-white/10"
                >
                  复制链接
                </button>
                <button
                  onClick={() => navigate('/blog')}
                  className="px-3 py-2 rounded-2xl border border-white/25 text-white/85 hover:bg-white/10"
                >
                  返回列表
                </button>
              </div>
            </div>

            <div className="mt-5">
              <MarkdownViewer content={sharedArticle.content} />
            </div>
          </div>
        )}
      </div>
    )
  }

  if (isLoggedIn && composeOpen) {
    const toolbar = [
      { label: 'H1', action: '# 标题\n' },
      { label: 'H2', action: '## 小标题\n' },
      { label: '粗体', action: '**粗体**' },
      { label: '斜体', action: '*斜体*' },
      { label: '链接', action: '[链接文本](https://example.com)' },
      { label: '图片', action: '![图片描述](https://example.com/image.png)' },
      { label: '列表', action: '- 列表项1\n- 列表项2\n' },
      { label: '代码块', action: '```ts\nconsole.log("hello")\n```\n' },
      { label: '表格', action: '| 列1 | 列2 |\n| --- | --- |\n| 值1 | 值2 |\n' },
      { label: '引用', action: '> 引用内容\n' },
    ]

    return (
      <div className="pb-8 px-0 sm:px-0">
        <form onSubmit={handlePublish} className="bg-white text-slate-900 rounded-none sm:rounded-3xl border border-slate-200 shadow-xl min-h-[80vh] overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">{editingArticleId ? '编辑文章' : '新建文章'}</h2>
                <span className="text-xs px-2 py-1 rounded-full bg-slate-200 text-slate-700">实时预览</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewMode('edit')}
                  className={`px-2.5 py-1.5 text-sm rounded-xl ${previewMode === 'edit' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('preview')}
                  className={`px-2.5 py-1.5 text-sm rounded-xl ${previewMode === 'preview' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}
                >
                  预览
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('split')}
                  className={`px-2.5 py-1.5 text-sm rounded-xl ${previewMode === 'split' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}
                >
                  分栏
                </button>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-3 mt-4">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="文章标题"
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white"
              />
              <input
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="文件夹 ID（可选）"
                list="blog-folder-list"
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white"
              />
              <div className="flex gap-2">
                <select
                  value={publishAs}
                  onChange={(e) => setPublishAs(e.target.value as 'draft' | 'published')}
                  className="px-3 py-2.5 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="published">发布</option>
                  <option value="draft">保存草稿</option>
                </select>
                <input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="标签，逗号分隔"
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 bg-white"
                />
              </div>
              <datalist id="blog-folder-list">
                {flatFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>{folder.name}</option>
                ))}
              </datalist>
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              {toolbar.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => insertSnippet(item.action)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 hover:bg-slate-100"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 min-h-[56vh]">
            {(previewMode === 'edit' || previewMode === 'split') && (
              <div className="border-r border-slate-200">
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="在这里编写 Markdown..."
                  className="w-full h-full min-h-[56vh] p-4 sm:p-5 resize-none focus:outline-none font-mono text-[14px] leading-6"
                />
              </div>
            )}

            {(previewMode === 'preview' || previewMode === 'split') && (
              <div className="bg-slate-50 min-h-[56vh] p-4 sm:p-5 overflow-auto">
                <div className="prose max-w-none prose-slate">
                  <MarkdownViewer theme="light" content={content || '### 预览区域\n\n开始输入 Markdown 内容...'} />
                </div>
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
                setSearchParams(next)
              }}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-200"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isPublishing || !title.trim() || !content.trim()}
              className="px-5 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {isPublishing ? '保存中...' : editingArticleId ? '更新文章' : '创建文章'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-8 px-3 sm:px-0">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-3xl sm:rounded-4xl p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl sm:text-2xl text-white font-bold text-gradient">博客空间</h2>
            <p className="text-white/65 mt-1 text-sm">当前文件夹：{selectedFolderName}</p>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            <select
              value={selectedStatus}
              onChange={(e) => {
                const next = new URLSearchParams(searchParams)
                next.set('status', e.target.value)
                setSearchParams(next)
              }}
              className="px-3 py-2 rounded-2xl bg-white/10 text-white border border-white/20"
            >
              <option value="published" className="text-black">已发布</option>
              <option value="draft" className="text-black">草稿</option>
            </select>

            <select
              value={folderId}
              onChange={(e) => {
                const next = new URLSearchParams(searchParams)
                if (e.target.value) next.set('folder', e.target.value)
                else next.delete('folder')
                setSearchParams(next)
              }}
              className="px-3 py-2 rounded-2xl bg-white/10 text-white border border-white/20"
            >
              <option value="">全部文件夹</option>
              {flatFolders.map((folder) => (
                <option key={folder.id} value={folder.id} className="text-black">{folder.name}</option>
              ))}
            </select>

            {isLoggedIn && (
              <button
                onClick={() => {
                  resetComposer()
                  const next = new URLSearchParams(searchParams)
                  next.set('compose', '1')
                  setSearchParams(next)
                }}
                className="btn-primary px-4 py-2 rounded-2xl text-white"
              >
                新建文章
              </button>
            )}
          </div>
        </div>

        {availableTags.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-3">
            {availableTags.map((tag) => (
              <button
                key={tag}
                onClick={() => {
                  const next = new URLSearchParams(searchParams)
                  if (selectedTag === tag) next.delete('tag')
                  else next.set('tag', tag)
                  setSearchParams(next)
                }}
                className={`px-3 py-1.5 rounded-full text-sm border ${
                  selectedTag === tag
                    ? 'bg-white/30 text-white border-white/40'
                    : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/20 hover:text-white'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {isLoggedIn && (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-3xl sm:rounded-4xl p-4 sm:p-6 space-y-3">
          <h3 className="text-white/90 font-semibold">文件夹管理</h3>

          <div className="grid gap-3 md:grid-cols-3">
            <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="新文件夹名称" className="px-3 py-2 rounded-2xl bg-white/10 text-white border border-white/20" />
            <select value={newFolderParentId} onChange={(e) => setNewFolderParentId(e.target.value)} className="px-3 py-2 rounded-2xl bg-white/10 text-white border border-white/20">
              <option value="">顶层</option>
              {flatFolders.map((folder) => (
                <option key={folder.id} value={folder.id} className="text-black">{folder.name}</option>
              ))}
            </select>
            <button onClick={handleCreateFolder} disabled={isMutatingFolder || !newFolderName.trim()} className="btn-primary rounded-2xl text-white px-4 py-2 disabled:opacity-50">创建文件夹</button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <select value={moveFolderId} onChange={(e) => setMoveFolderId(e.target.value)} className="px-3 py-2 rounded-2xl bg-white/10 text-white border border-white/20">
              <option value="">选择要调整的文件夹</option>
              {flatFolders.map((folder) => (
                <option key={folder.id} value={folder.id} className="text-black">{folder.name}</option>
              ))}
            </select>
            <select value={moveToParentId} onChange={(e) => setMoveToParentId(e.target.value)} className="px-3 py-2 rounded-2xl bg-white/10 text-white border border-white/20">
              <option value="">移动到顶层</option>
              {flatFolders.filter((folder) => folder.id !== moveFolderId).map((folder) => (
                <option key={folder.id} value={folder.id} className="text-black">{folder.name}</option>
              ))}
            </select>
            <button onClick={handleMoveFolder} disabled={isMutatingFolder || !moveFolderId} className="rounded-2xl border border-white/30 text-white px-4 py-2 disabled:opacity-50 hover:bg-white/10">调整层级</button>
          </div>
        </motion.div>
      )}

      {isLoading ? (
        <div className="glass-card rounded-4xl p-8 text-center text-white/70">
          <LoadingSpinner text="正在加载博客..." />
        </div>
      ) : error ? (
        <div className="glass-card rounded-4xl p-8 text-center text-red-200">{error}</div>
      ) : articles.length === 0 ? (
        <div className="glass-card rounded-4xl p-10 text-center text-white/60">
          <p className="text-5xl mb-3">📝</p>
          <p>当前筛选下暂无文章</p>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {articles.map((article, index) => (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="w-full text-left glass-card rounded-3xl sm:rounded-4xl p-4 sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => navigate(`/blog/${article.id}`)} className="text-left flex-1">
                  <h3 className="text-white text-lg sm:text-xl font-semibold mb-2">{article.title}</h3>
                  <p className="text-white/65 text-sm mb-3 line-clamp-2">{article.content.replace(/#+\s?.*\n/g, '').trim()}</p>
                </button>
                <div className="flex gap-2">
                  <button onClick={() => copyShareUrl(article.id)} className="px-3 py-1.5 rounded-xl border border-white/25 text-white/85 hover:bg-white/10">复制链接</button>
                  {isLoggedIn && (
                    <>
                      <button onClick={() => openEditor(article)} className="px-3 py-1.5 rounded-xl border border-white/25 text-white/80 hover:bg-white/10">编辑</button>
                      <button onClick={() => handleDelete(article.id)} className="px-3 py-1.5 rounded-xl border border-red-300/40 text-red-100 bg-red-500/20 hover:bg-red-500/35">删除</button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex gap-2 flex-wrap">
                  <span className={`px-2 py-1 rounded-full text-xs ${article.status === 'draft' ? 'bg-amber-400/20 text-amber-200' : 'bg-emerald-400/20 text-emerald-200'}`}>
                    {article.status === 'draft' ? '草稿' : '已发布'}
                  </span>
                  {(article.tags || []).map((tag) => (
                    <span key={`${article.id}-${tag}`} className="px-2 py-1 rounded-full text-xs bg-white/15 text-white/70">#{tag}</span>
                  ))}
                </div>
                <span className="text-white/45 text-sm">{formatDate(article.updatedAt || article.createdAt)}</span>
              </div>
            </motion.div>
          ))}

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => loadArticles({ reset: false, pageToken: nextPageToken })}
                disabled={isLoadingMore}
                className="px-5 py-2.5 rounded-2xl border border-white/25 text-white/85 hover:text-white hover:bg-white/10 disabled:opacity-50"
              >
                {isLoadingMore ? '加载中...' : '加载更多'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
