import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { clients } from '../lib/connect'

interface Folder {
  id: string
  name: string
  icon: string
  articleCount: number
  children?: Folder[]
}

interface ApiArticle {
  folderId: string
}

interface ApiFolder {
  id: string
  name: string
  children?: ApiFolder[]
}

interface FolderItemProps {
  folder: Folder
  level: number
  activeId: string | null
  onSelect: (id: string) => void
}

const FolderItem = ({ folder, level, activeId, onSelect }: FolderItemProps) => {
  const [isExpanded, setIsExpanded] = useState(level < 2)
  const hasChildren = folder.children && folder.children.length > 0
  const isActive = activeId === folder.id

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
        onClick={() => onSelect(folder.id)}
        className={`
          flex items-center gap-2 px-3 py-2.5 rounded-2xl cursor-pointer transition-all
          ${isActive ? 'bg-white/30 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'}
        `}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
      >
        {hasChildren && (
          <motion.button
            onClick={toggleExpand}
            animate={{ rotate: isExpanded ? 90 : 0 }}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
          >
            <span className="text-white/50 text-sm">▶</span>
          </motion.button>
        )}
        {!hasChildren && <div className="w-6 flex-shrink-0"></div>}

        <span className="text-xl flex-shrink-0">{folder.icon}</span>

        <span className="flex-1 text-left truncate font-medium">
          {folder.name}
        </span>

        <span className="text-xs bg-white/15 px-2 py-0.5 rounded-full text-white/70 flex-shrink-0">
          {folder.articleCount}
        </span>
      </motion.div>

      <AnimatePresence initial={false}>
        {hasChildren && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            {folder.children!.map((child) => (
              <FolderItem
                key={child.id}
                folder={child}
                level={level + 1}
                activeId={activeId}
                onSelect={onSelect}
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
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const activeId = searchParams.get('folder')

  useEffect(() => {
    const loadFolders = async () => {
      try {
        const response = await clients.blog.listArticles({ pageSize: 200 })
        const articleCounts = new Map<string, number>()

        for (const article of (response.articles || []) as ApiArticle[]) {
          if (!article.folderId) continue
          articleCounts.set(article.folderId, (articleCounts.get(article.folderId) || 0) + 1)
        }

        const toViewFolder = (folder: ApiFolder): Folder => ({
          id: folder.id,
          name: folder.name || '未命名文件夹',
          icon: folder.children?.length ? '📁' : '📄',
          articleCount: articleCounts.get(folder.id) || 0,
          children: (folder.children || []).map((child) => toViewFolder(child)),
        })

        setFolders(((response.folders || []) as ApiFolder[]).map((folder) => toViewFolder(folder)))
      } catch (error) {
        console.error('Failed to load folders:', error)
        setFolders([])
      } finally {
        setIsLoading(false)
      }
    }

    loadFolders()
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
        const isMatch = node.name.toLowerCase().includes(query)

        if (!isMatch && filteredChildren.length === 0) {
          return null
        }

        return {
          ...node,
          children: filteredChildren,
        }
      })
      .filter(Boolean) as Folder[]
  }

  const visibleFolders = filterFolders(folders)

  const handleSelectFolder = (folderId: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('folder', folderId)
    navigate({ pathname: '/blog', search: next.toString() })
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
        <span className="text-xs text-white/50 bg-white/10 px-2 py-1 rounded-full">
          {totalArticles} 篇文章
        </span>
      </div>

      {/* 搜索框 */}
      <div className="mb-4">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">🔍</span>
          <input
            type="text"
            placeholder="搜索文件夹..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white/10 text-white placeholder-white/40 border border-white/15 focus:border-white/30 focus:outline-none focus:bg-white/15 transition-all"
          />
        </div>
      </div>

      {/* 文件夹树 */}
      <div className="space-y-1 max-h-80 overflow-y-auto scrollbar-hide">
        {folders.length > 0 ? (
          visibleFolders.map((folder) => (
            <FolderItem
              key={folder.id}
              folder={folder}
              level={0}
              activeId={activeId}
              onSelect={handleSelectFolder}
            />
          ))
        ) : (
          <div className="text-center py-8 text-white/50">
            <p className="text-4xl mb-4">📝</p>
            <p>还没有博客文章</p>
          </div>
        )}
      </div>

      {/* 快捷操作 */}
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
