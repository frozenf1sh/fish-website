import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
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

export function BlogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const isLoggedIn = useStore((state) => state.isLoggedIn)

  const folderId = searchParams.get('folder') || ''
  const selectedTag = searchParams.get('tag') || ''
  const composeOpen = searchParams.get('compose') === '1'

  const [articles, setArticles] = useState<BlogArticle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedArticle, setSelectedArticle] = useState<BlogArticle | null>(null)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [folderInput, setFolderInput] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)

  const loadArticles = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await clients.blog.listArticles({
        pageSize: 50,
        folderId,
        tag: selectedTag,
      })
      setArticles(response.articles || [])
    } catch (err) {
      console.error('Failed to load blog articles:', err)
      setError('加载博客失败，请稍后重试')
      setArticles([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadArticles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, selectedTag])

  const availableTags = useMemo(() => {
    const set = new Set<string>()
    for (const article of articles) {
      for (const tag of article.tags || []) {
        if (tag) set.add(tag)
      }
    }
    return Array.from(set)
  }, [articles])

  const resetComposer = () => {
    setTitle('')
    setContent('')
    setTagsInput('')
    setFolderInput('')
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

      await clients.blog.createArticle({
        title: title.trim(),
        content: content.trim(),
        folderId: folderInput.trim(),
        tags,
      })

      resetComposer()
      const next = new URLSearchParams(searchParams)
      next.delete('compose')
      setSearchParams(next)
      await loadArticles()
    } catch (err) {
      console.error('Failed to create article:', err)
      alert('发布文章失败，请稍后重试')
    } finally {
      setIsPublishing(false)
    }
  }

  const openArticle = async (article: BlogArticle) => {
    try {
      const response = await clients.blog.getArticle({ articleId: article.id })
      setSelectedArticle((response.article as BlogArticle) || article)
    } catch (err) {
      console.error('Failed to load article details:', err)
      setSelectedArticle(article)
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel rounded-4xl p-6"
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl text-white font-bold text-gradient">博客空间</h2>
            <p className="text-white/65 mt-1 text-sm">沉淀长文、知识卡片与项目记录</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {availableTags.map((tag) => (
              <button
                key={tag}
                onClick={() => {
                  const next = new URLSearchParams(searchParams)
                  if (selectedTag === tag) {
                    next.delete('tag')
                  } else {
                    next.set('tag', tag)
                  }
                  setSearchParams(next)
                }}
                className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                  selectedTag === tag
                    ? 'bg-white/30 text-white border-white/40'
                    : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/20 hover:text-white'
                }`}
              >
                #{tag}
              </button>
            ))}
            {isLoggedIn && (
              <button
                onClick={() => {
                  const next = new URLSearchParams(searchParams)
                  next.set('compose', '1')
                  setSearchParams(next)
                }}
                className="btn-primary px-4 py-2 rounded-2xl text-white font-medium"
              >
                新建文章
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {isLoggedIn && composeOpen && (
        <motion.form
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handlePublish}
          className="glass-card rounded-4xl p-6 space-y-4"
        >
          <div className="grid md:grid-cols-2 gap-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="文章标题"
              className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20 focus:outline-none focus:border-white/40"
            />
            <input
              value={folderInput}
              onChange={(e) => setFolderInput(e.target.value)}
              placeholder="文件夹 ID（可选）"
              className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20 focus:outline-none focus:border-white/40"
            />
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="支持 Markdown，开始写作吧..."
            rows={10}
            className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20 focus:outline-none focus:border-white/40 resize-y"
          />
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="标签，逗号分隔，例如：Go,前端,架构"
            className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20 focus:outline-none focus:border-white/40"
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                const next = new URLSearchParams(searchParams)
                next.delete('compose')
                setSearchParams(next)
              }}
              className="px-4 py-2 rounded-2xl border border-white/20 text-white/80 hover:text-white hover:bg-white/10"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isPublishing || !title.trim() || !content.trim()}
              className="btn-primary px-5 py-2 rounded-2xl text-white disabled:opacity-50"
            >
              {isPublishing ? '发布中...' : '发布文章'}
            </button>
          </div>
        </motion.form>
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
        <div className="space-y-4">
          {articles.map((article, index) => (
            <motion.button
              key={article.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              onClick={() => openArticle(article)}
              className="w-full text-left glass-card rounded-4xl p-6 hover:scale-[1.01] transition-all"
            >
              <h3 className="text-white text-xl font-semibold mb-2">{article.title}</h3>
              <p className="text-white/65 text-sm mb-4 line-clamp-2">
                {article.content.replace(/#+\s?.*\n/g, '').trim()}
              </p>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex gap-2 flex-wrap">
                  {(article.tags || []).map((tag) => (
                    <span key={`${article.id}-${tag}`} className="px-2 py-1 rounded-full text-xs bg-white/15 text-white/70">
                      #{tag}
                    </span>
                  ))}
                </div>
                <span className="text-white/45 text-sm">{formatDate(article.updatedAt || article.createdAt)}</span>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selectedArticle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/65 backdrop-blur-sm p-4 md:p-10"
            onClick={() => setSelectedArticle(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
              className="max-w-4xl mx-auto h-full overflow-hidden glass-panel rounded-4xl border border-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-white/15 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-white text-2xl font-bold">{selectedArticle.title}</h3>
                  <p className="text-white/50 text-sm mt-1">{formatDate(selectedArticle.updatedAt || selectedArticle.createdAt)}</p>
                </div>
                <button
                  onClick={() => setSelectedArticle(null)}
                  className="w-9 h-9 rounded-full bg-white/15 text-white hover:bg-white/25"
                >
                  ✕
                </button>
              </div>
              <div className="p-6 h-[calc(100%-96px)] overflow-y-auto scrollbar-hide">
                <MarkdownViewer content={selectedArticle.content} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
