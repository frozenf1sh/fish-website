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

type PreviewMode = 'split' | 'edit' | 'preview'

const ROOT_FOLDER_ID = 'root'

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

  const folderId = searchParams.get('folder') || ROOT_FOLDER_ID
  const composeOpen = searchParams.get('compose') === '1'

  const [articles, setArticles] = useState<BlogArticle[]>([])
  const [nextPageToken, setNextPageToken] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [sharedArticle, setSharedArticle] = useState<BlogArticle | null>(null)
  const [isLoadingShared, setIsLoadingShared] = useState(false)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('split')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const [manageMode, setManageMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [newFolderName, setNewFolderName] = useState('')
  const [isManaging, setIsManaging] = useState(false)

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
      alert('分享链接已复制')
    } catch {
      alert('复制失败，请手动复制地址栏链接')
    }
  }

  const resetComposer = () => {
    setTitle('')
    setContent('')
    setTagsInput('')
    setPreviewMode('split')
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
        status: 'published',
      })

      const newArticles = (response.articles || []) as BlogArticle[]
      setArticles((prev) => (reset ? newArticles : [...prev, ...newArticles]))
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
    if (articleId) return
    if (!searchParams.get('folder')) {
      const next = new URLSearchParams(searchParams)
      next.set('folder', ROOT_FOLDER_ID)
      setSearchParams(next, { replace: true })
      return
    }
    loadArticles({ reset: true, pageToken: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, folderId])

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
      const tags = tagsInput.split(',').map((item) => item.trim()).filter(Boolean)
      const created = await clients.blog.createArticle({
        title: title.trim(),
        content: content.trim(),
        folderId,
        tags,
        status: 'published',
      })

      resetComposer()
      window.dispatchEvent(new Event('blog:updated'))
      if (created.article?.id) {
        navigate(`/blog/${created.article.id}`)
      } else {
        await loadArticles({ reset: true, pageToken: '' })
      }
      alert('文章已创建')
    } catch (err) {
      console.error('Failed to create article:', err)
      alert('创建文章失败，请重试')
    } finally {
      setIsPublishing(false)
    }
  }

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return
    if (!window.confirm(`确认删除选中的 ${selectedIds.length} 篇文章吗？`)) return

    setIsManaging(true)
    try {
      await Promise.all(selectedIds.map((id) => clients.blog.deleteArticle({ articleId: id })))
      setSelectedIds([])
      await loadArticles({ reset: true, pageToken: '' })
      window.dispatchEvent(new Event('blog:updated'))
      alert('删除成功')
    } catch (err) {
      console.error('Failed to delete selected articles:', err)
      alert('删除失败，请重试')
    } finally {
      setIsManaging(false)
    }
  }

  const moveSelectedToNewFolder = async () => {
    if (!newFolderName.trim() || selectedIds.length === 0) return

    setIsManaging(true)
    try {
      const createdFolder = await clients.blog.createFolder({
        name: newFolderName.trim(),
        parentFolderId: folderId,
      })

      const targetFolderId = createdFolder.folder?.id
      if (!targetFolderId) {
        throw new Error('创建目标文件夹失败')
      }

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
      setNewFolderName('')
      await loadArticles({ reset: true, pageToken: '' })
      window.dispatchEvent(new Event('blog:updated'))
      alert('已移动到新文件夹')
    } catch (err) {
      console.error('Failed to move selected articles:', err)
      alert('移动失败，请重试')
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
          <div className="glass-panel rounded-3xl sm:rounded-4xl p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 flex-wrap pb-4 border-b border-white/15">
              <div>
                <h1 className="text-white text-2xl sm:text-3xl font-bold">{sharedArticle.title}</h1>
                <p className="text-white/55 text-sm mt-1">{formatDate(sharedArticle.updatedAt || sharedArticle.createdAt)}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => copyShareUrl(sharedArticle.id)} className="px-3 py-2 rounded-2xl border border-white/25 text-white/85 hover:bg-white/10">复制链接</button>
                <button onClick={() => navigate('/blog')} className="px-3 py-2 rounded-2xl border border-white/25 text-white/85 hover:bg-white/10">返回列表</button>
              </div>
            </div>
            <div className="mt-5 text-white">
              <MarkdownViewer content={sharedArticle.content} theme="dark" />
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
                <h2 className="text-xl font-semibold">新建文章</h2>
                <span className="text-xs px-2 py-1 rounded-full bg-slate-200 text-slate-700">实时预览</span>
              </div>
              <div className="flex items-center gap-2">
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
              {toolbar.map((item) => (
                <button key={item.label} type="button" onClick={() => insertSnippet(item.action)} className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 hover:bg-slate-100">
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
                setSearchParams(next)
              }}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-200"
            >
              取消
            </button>
            <button type="submit" disabled={isPublishing || !title.trim() || !content.trim()} className="px-5 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
              {isPublishing ? '创建中...' : '发布文章'}
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
            <h2 className="text-xl sm:text-2xl text-white font-bold text-gradient">博客时间线</h2>
            <p className="text-white/65 mt-1 text-sm">当前文件夹：{folderId === ROOT_FOLDER_ID ? '根目录' : folderId}</p>
          </div>

          {isLoggedIn && (
            <div className="flex gap-2">
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
                  setSearchParams(next)
                }}
                className="btn-primary px-4 py-2 rounded-2xl text-white"
              >
                新建文章
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {isLoggedIn && manageMode && (
        <div className="glass-card rounded-3xl sm:rounded-4xl p-4 sm:p-6 space-y-3">
          <p className="text-white/85 text-sm">已选中 {selectedIds.length} 篇文章</p>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="输入新文件夹名称"
              className="flex-1 px-4 py-2 rounded-2xl bg-white/10 text-white border border-white/20"
            />
            <button onClick={moveSelectedToNewFolder} disabled={isManaging || selectedIds.length === 0 || !newFolderName.trim()} className="px-4 py-2 rounded-2xl border border-white/30 text-white hover:bg-white/10 disabled:opacity-50">移动到新文件夹</button>
            <button onClick={deleteSelected} disabled={isManaging || selectedIds.length === 0} className="px-4 py-2 rounded-2xl border border-red-300/40 text-red-100 bg-red-500/20 hover:bg-red-500/35 disabled:opacity-50">删除所选</button>
          </div>
        </div>
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
              className="w-full text-left glass-card rounded-3xl sm:rounded-4xl p-4 sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => navigate(`/blog/${article.id}`)} className="text-left flex-1">
                  <h3 className="text-white text-lg sm:text-xl font-semibold mb-2">{article.title}</h3>
                  <p className="text-white/65 text-sm mb-3 line-clamp-2">{article.content.replace(/#+\s?.*\n/g, '').trim()}</p>
                </button>
                <div className="flex items-center gap-2">
                  {isLoggedIn && manageMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(article.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds((prev) => [...prev, article.id])
                        } else {
                          setSelectedIds((prev) => prev.filter((id) => id !== article.id))
                        }
                      }}
                      className="w-4 h-4"
                    />
                  )}
                  <button onClick={() => copyShareUrl(article.id)} className="px-3 py-1.5 rounded-xl border border-white/25 text-white/85 hover:bg-white/10">复制链接</button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex gap-2 flex-wrap">
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
              <button onClick={() => loadArticles({ reset: false, pageToken: nextPageToken })} disabled={isLoadingMore} className="px-5 py-2.5 rounded-2xl border border-white/25 text-white/85 hover:text-white hover:bg-white/10 disabled:opacity-50">
                {isLoadingMore ? '加载中...' : '加载更多'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
