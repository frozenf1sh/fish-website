import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { clients } from '../lib/connect'
import { useStore } from '../store/useStore'

interface Folder {
  id: string
  name: string
  icon: string
  articleCount: number
  children?: Folder[]
  files?: ArticleFile[]
}

interface ArticleFile {
  id: string
  title: string
  content: string
  folderId: string
  tags: string[]
  status: 'draft' | 'published'
}

interface ApiArticle {
  id: string
  title: string
  content: string
  folderId: string
  tags?: string[]
  status?: 'draft' | 'published'
}

interface ApiFolder {
  id: string
  name: string
  children?: ApiFolder[]
}

interface ListArticlesResponse {
  articles?: ApiArticle[]
  folders?: ApiFolder[]
  nextPageToken?: string
  hasMore?: boolean
}

interface DragPayload {
  type: 'folder' | 'article'
  id: string
}

interface FolderItemProps {
  folder: Folder
  level: number
  activeId: string | null
  activeArticleId: string | null
  dragEnabled: boolean
  isLoggedIn: boolean
  dragPayload: DragPayload | null
  onSelectFolder: (id: string) => void
  onSelectArticle: (id: string, folderId: string) => void
  onDragStart: (payload: DragPayload) => void
  onDropToFolder: (targetFolderId: string) => void
}

const FolderItem = ({
  folder,
  level,
  activeId,
  activeArticleId,
  dragEnabled,
  isLoggedIn,
  dragPayload,
  onSelectFolder,
  onSelectArticle,
  onDragStart,
  onDropToFolder,
}: FolderItemProps) => {
  const [isExpanded, setIsExpanded] = useState(level < 2)
  const hasChildren = (folder.children && folder.children.length > 0) || (folder.files && folder.files.length > 0)
  const isActive = activeId === folder.id
  const isDropTarget = dragEnabled && dragPayload && dragPayload.type === 'folder' && dragPayload.id !== folder.id

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsExpanded(!isExpanded)
  }

  return (
    <div className="select-none">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        whileHover={{ x: 4 }}
        onClick={() => onSelectFolder(folder.id)}
        draggable={isLoggedIn && dragEnabled}
        onDragStart={() => onDragStart({ type: 'folder', id: folder.id })}
        onDragOver={(e) => {
          if (!dragEnabled) return
          e.preventDefault()
        }}
        onDrop={(e) => {
          if (!dragEnabled) return
          e.preventDefault()
          onDropToFolder(folder.id)
        }}
        className={[
          'flex items-center gap-2 px-3 py-2.5 rounded-2xl cursor-pointer transition-all border',
          isActive ? 'bg-white/30 text-white border-white/35' : 'text-white/70 hover:text-white hover:bg-white/10 border-transparent',
          isDropTarget ? 'border-cyan-300/70 bg-cyan-400/10' : '',
        ].join(' ')}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
      >
        {hasChildren ? (
          <motion.button
            onClick={toggleExpand}
            animate={{ rotate: isExpanded ? 90 : 0 }}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
          >
            <span className="text-white/50 text-sm">▶</span>
          </motion.button>
        ) : (
          <div className="w-6 flex-shrink-0" />
        )}

        <span className="text-xl flex-shrink-0">{folder.icon}</span>

        <span className="flex-1 text-left truncate font-medium">{folder.name}</span>

        {dragEnabled && isLoggedIn && <span className="text-xs text-white/50">↕</span>}

        <span className="text-xs bg-white/15 px-2 py-0.5 rounded-full text-white/70 flex-shrink-0">{folder.articleCount}</span>
      </motion.div>

      <AnimatePresence initial={false}>
        {hasChildren && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            {(folder.files || []).map((file) => {
              const fileActive = activeArticleId === file.id
              return (
                <div
                  key={file.id}
                  draggable={isLoggedIn && dragEnabled}
                  onDragStart={() => onDragStart({ type: 'article', id: file.id })}
                  onClick={() => onSelectArticle(file.id, folder.id)}
                  className={[
                    'ml-5 mt-1 mr-1 px-3 py-2 rounded-xl border text-sm transition-all cursor-pointer flex items-center gap-2',
                    fileActive ? 'bg-white/25 text-white border-white/30' : 'bg-white/5 text-white/70 border-transparent hover:bg-white/10 hover:text-white',
                  ].join(' ')}
                >
                  <span>📄</span>
                  <span className="truncate flex-1">{file.title || '未命名文章'}</span>
                  {dragEnabled && isLoggedIn && <span className="text-xs text-white/50">↕</span>}
                </div>
              )
            })}

            {(folder.children || []).map((child) => (
              <FolderItem
                key={child.id}
                folder={child}
                level={level + 1}
                activeId={activeId}
                activeArticleId={activeArticleId}
                dragEnabled={dragEnabled}
                isLoggedIn={isLoggedIn}
                dragPayload={dragPayload}
                onSelectFolder={onSelectFolder}
                onSelectArticle={onSelectArticle}
                onDragStart={onDragStart}
                onDropToFolder={onDropToFolder}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function BlogFolderTree() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [allArticles, setAllArticles] = useState<ArticleFile[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isApplyingDrop, setIsApplyingDrop] = useState(false)
  const [dragEnabled, setDragEnabled] = useState(false)
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null)

  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isLoggedIn = useStore((state) => state.isLoggedIn)

  const activeId = searchParams.get('folder')
  const activeArticleId = searchParams.get('article')

  const folderMap = useMemo(() => {
    const map = new Map<string, Folder>()
    const walk = (nodes: Folder[]) => {
      for (const node of nodes) {
        map.set(node.id, node)
        walk(node.children || [])
      }
    }
    walk(folders)
    return map
  }, [folders])

  const articleMap = useMemo(() => {
    const map = new Map<string, ArticleFile>()
    for (const item of allArticles) {
      map.set(item.id, item)
    }
    return map
  }, [allArticles])

  const collectDescendantIds = (folderId: string): Set<string> => {
    const result = new Set<string>()
    const walk = (id: string) => {
      const current = folderMap.get(id)
      if (!current) return
      for (const child of current.children || []) {
        result.add(child.id)
        walk(child.id)
      }
    }
    walk(folderId)
    return result
  }

  useEffect(() => {
    const loadFolders = async () => {
      setIsLoading(true)
      try {
        const articleCounts = new Map<string, number>()
        const articles: ArticleFile[] = []
        let allFolders: ApiFolder[] = []
        let pageToken = ''
        let hasMore = true
        let guard = 0

        while (hasMore && guard < 50) {
          const response = (await clients.blog.listArticles({
            pageSize: 100,
            pageToken,
            status: 'published',
          })) as ListArticlesResponse

          if (allFolders.length === 0) {
            allFolders = response.folders || []
          }

          for (const article of response.articles || []) {
            const folderId = article.folderId || ''
            if (folderId) {
              articleCounts.set(folderId, (articleCounts.get(folderId) || 0) + 1)
            }
            articles.push({
              id: article.id,
              title: article.title,
              content: article.content,
              folderId,
              tags: article.tags || [],
              status: article.status || 'published',
            })
          }

          hasMore = !!response.hasMore
          pageToken = response.nextPageToken || ''
          guard += 1
        }

        const fileByFolderId = new Map<string, ArticleFile[]>()
        for (const article of articles) {
          if (!article.folderId) continue
          if (!fileByFolderId.has(article.folderId)) {
            fileByFolderId.set(article.folderId, [])
          }
          fileByFolderId.get(article.folderId)!.push(article)
        }

        const toViewFolder = (folder: ApiFolder): Folder => ({
          id: folder.id,
          name: folder.name || '未命名文件夹',
          icon: folder.children?.length ? '📁' : '📂',
          articleCount: articleCounts.get(folder.id) || 0,
          children: (folder.children || []).map((child) => toViewFolder(child)),
          files: (fileByFolderId.get(folder.id) || []).sort((a, b) => a.title.localeCompare(b.title, 'zh-CN')),
        })

        setAllArticles(articles)
        setFolders(allFolders.map((folder) => toViewFolder(folder)))
      } catch (error) {
        console.error('Failed to load folders:', error)
        setFolders([])
      } finally {
        setIsLoading(false)
      }
    }

    loadFolders()

    const handleBlogUpdated = () => {
      loadFolders()
    }

    window.addEventListener('blog:updated', handleBlogUpdated)
    return () => {
      window.removeEventListener('blog:updated', handleBlogUpdated)
    }
  }, [])

  const totalArticles = folders.reduce((sum, folder) => {
    const countChildren = (nodes: Folder[]): number => {
      return nodes.reduce((acc, node) => acc + node.articleCount + countChildren(node.children || []), 0)
    }
    return sum + folder.articleCount + countChildren(folder.children || [])
  }, 0)

  const filterFolders = (nodes: Folder[]): Folder[] => {
    if (!searchQuery.trim()) return nodes
    const query = searchQuery.trim().toLowerCase()

    return nodes
      .map((node) => {
        const filteredChildren = filterFolders(node.children || [])
        const filteredFiles = (node.files || []).filter((file) => file.title.toLowerCase().includes(query))
        const isFolderMatch = node.name.toLowerCase().includes(query)

        if (!isFolderMatch && filteredChildren.length === 0 && filteredFiles.length === 0) {
          return null
        }

        return {
          ...node,
          children: filteredChildren,
          files: filteredFiles,
        }
      })
      .filter(Boolean) as Folder[]
  }

  const visibleFolders = filterFolders(folders)

  const handleSelectFolder = (folderId: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('folder', folderId)
    next.delete('article')
    navigate({ pathname: '/blog', search: next.toString() })
  }

  const handleSelectArticle = (articleId: string, folderId: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('folder', folderId)
    next.set('article', articleId)
    navigate({ pathname: '/blog', search: next.toString() })
  }

  const applyDropToRoot = async () => {
    if (!isLoggedIn || !dragEnabled || !dragPayload) return

    setIsApplyingDrop(true)
    try {
      if (dragPayload.type === 'folder') {
        const target = folderMap.get(dragPayload.id)
        if (!target) return
        await clients.blog.updateFolder({
          folderId: target.id,
          name: target.name,
          parentFolderId: '',
        })
      } else {
        const target = articleMap.get(dragPayload.id)
        if (!target) return
        await clients.blog.updateArticle({
          articleId: target.id,
          title: target.title,
          content: target.content,
          folderId: '',
          tags: target.tags,
          status: target.status,
        })
      }

      window.dispatchEvent(new Event('blog:updated'))
    } catch (error) {
      console.error('Failed to drop to root', error)
      alert('拖拽更新失败，请重试')
    } finally {
      setDragPayload(null)
      setIsApplyingDrop(false)
    }
  }

  const applyDropToFolder = async (targetFolderId: string) => {
    if (!isLoggedIn || !dragEnabled || !dragPayload) return

    setIsApplyingDrop(true)
    try {
      if (dragPayload.type === 'folder') {
        const sourceFolder = folderMap.get(dragPayload.id)
        if (!sourceFolder) return
        if (sourceFolder.id === targetFolderId) return

        const descendants = collectDescendantIds(sourceFolder.id)
        if (descendants.has(targetFolderId)) {
          alert('不能将父文件夹拖拽到自己的子级')
          return
        }

        await clients.blog.updateFolder({
          folderId: sourceFolder.id,
          name: sourceFolder.name,
          parentFolderId: targetFolderId,
        })
      } else {
        const sourceArticle = articleMap.get(dragPayload.id)
        if (!sourceArticle) return

        await clients.blog.updateArticle({
          articleId: sourceArticle.id,
          title: sourceArticle.title,
          content: sourceArticle.content,
          folderId: targetFolderId,
          tags: sourceArticle.tags,
          status: sourceArticle.status,
        })
      }

      window.dispatchEvent(new Event('blog:updated'))
    } catch (error) {
      console.error('Failed to apply drag drop update', error)
      alert('拖拽更新失败，请重试')
    } finally {
      setDragPayload(null)
      setIsApplyingDrop(false)
    }
  }

  if (isLoading) {
    return (
      <div className="glass-card rounded-4xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white/90 font-semibold flex items-center gap-2">
            <span className="text-lg">📁</span>
            博客目录
          </h3>
        </div>
        <div className="text-center py-8 text-white/50">
          <p>加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-card rounded-4xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white/90 font-semibold flex items-center gap-2">
          <span className="text-lg">📁</span>
          博客目录
        </h3>
        <span className="text-xs text-white/50 bg-white/10 px-2 py-1 rounded-full">{totalArticles} 篇文章</span>
      </div>

      {isLoggedIn && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
          <span className="text-xs text-white/70">拖拽编辑</span>
          <button
            onClick={() => setDragEnabled((prev) => !prev)}
            className={[
              'relative w-11 h-6 rounded-full transition-colors',
              dragEnabled ? 'bg-cyan-400/70' : 'bg-white/20',
            ].join(' ')}
            aria-label="切换拖拽编辑"
          >
            <span
              className={[
                'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                dragEnabled ? 'translate-x-5' : 'translate-x-0.5',
              ].join(' ')}
            />
          </button>
        </div>
      )}

      {dragEnabled && (
        <div
          className="mb-3 rounded-2xl border border-dashed border-cyan-300/60 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100"
          onDragOver={(e) => {
            e.preventDefault()
          }}
          onDrop={(e) => {
            e.preventDefault()
            applyDropToRoot()
          }}
        >
          拖到这里移动到根目录 {isApplyingDrop ? '（处理中...）' : ''}
        </div>
      )}

      <div className="mb-4">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">🔍</span>
          <input
            type="text"
            placeholder="搜索文件夹或文章..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white/10 text-white placeholder-white/40 border border-white/15 focus:border-white/30 focus:outline-none focus:bg-white/15 transition-all"
          />
        </div>
      </div>

      <div className="space-y-1 max-h-80 overflow-y-auto scrollbar-hide">
        {folders.length > 0 ? (
          visibleFolders.map((folder) => (
            <FolderItem
              key={folder.id}
              folder={folder}
              level={0}
              activeId={activeId}
              activeArticleId={activeArticleId}
              dragEnabled={dragEnabled}
              isLoggedIn={isLoggedIn}
              dragPayload={dragPayload}
              onSelectFolder={handleSelectFolder}
              onSelectArticle={handleSelectArticle}
              onDragStart={(payload) => setDragPayload(payload)}
              onDropToFolder={applyDropToFolder}
            />
          ))
        ) : (
          <div className="text-center py-8 text-white/50">
            <p className="text-4xl mb-4">📝</p>
            <p>还没有博客文章</p>
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-white/10">
        <button
          onClick={() => navigate('/blog?compose=1')}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-blue-400/20 to-purple-400/20 text-white/80 hover:text-white hover:from-blue-400/30 hover:to-purple-400/30 transition-all border border-white/10"
        >
          <span>📝</span>
          <span className="font-medium">新建文章</span>
        </button>
      </div>
    </div>
  )
}
