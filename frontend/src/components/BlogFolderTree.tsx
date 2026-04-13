import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { clients } from '../lib/connect'
import { useStore } from '../store/useStore'

interface Folder {
  id: string
  name: string
  children?: Folder[]
}

interface ApiFolder {
  id: string
  name: string
  children?: ApiFolder[]
}

interface FolderItemProps {
  folder: Folder
  level: number
  activeId: string
  onSelect: (id: string) => void
}

const FolderItem = ({ folder, level, activeId, onSelect }: FolderItemProps) => {
  const [isExpanded, setIsExpanded] = useState(level < 1)
  const hasChildren = (folder.children || []).length > 0
  const isActive = activeId === folder.id

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all ${isActive ? 'bg-white/25 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}
        style={{ paddingLeft: `${12 + level * 16}px` }}
        onClick={() => onSelect(folder.id)}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded((prev) => !prev)
            }}
            className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-white/10"
          >
            <motion.span animate={{ rotate: isExpanded ? 90 : 0 }} className="text-xs">▶</motion.span>
          </button>
        ) : (
          <span className="w-5 h-5" />
        )}
        <span>{folder.id === 'root' ? '🗂️' : '📁'}</span>
        <span className="truncate">{folder.name}</span>
      </div>

      <AnimatePresence initial={false}>
        {hasChildren && isExpanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            {folder.children!.map((child) => (
              <FolderItem key={child.id} folder={child} level={level + 1} activeId={activeId} onSelect={onSelect} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function BlogFolderTree() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isLoggedIn = useStore((state) => state.isLoggedIn)
  const activeId = searchParams.get('folder') || 'root'

  useEffect(() => {
    const loadFolders = async () => {
      setIsLoading(true)
      try {
        const response = await clients.blog.listArticles({ pageSize: 1, folderId: '', status: 'published' })
        const apiFolders = (response.folders || []) as ApiFolder[]

        const toFolder = (f: ApiFolder): Folder => ({
          id: f.id,
          name: f.name || '未命名文件夹',
          children: (f.children || []).map((item) => toFolder(item)),
        })

        const normalized = apiFolders.length > 0 ? apiFolders.map((item) => toFolder(item)) : [{ id: 'root', name: '根目录', children: [] }]
        setFolders(normalized)
      } catch (err) {
        console.error('load folders failed', err)
        setFolders([{ id: 'root', name: '根目录', children: [] }])
      } finally {
        setIsLoading(false)
      }
    }

    loadFolders()
    const onUpdated = () => loadFolders()
    window.addEventListener('blog:updated', onUpdated)
    return () => window.removeEventListener('blog:updated', onUpdated)
  }, [])

  const handleSelect = (folderId: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('folder', folderId)
    next.delete('compose')
    navigate({ pathname: '/blog', search: next.toString() })
  }

  return (
    <div className="glass-card rounded-4xl p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white/90 font-semibold flex items-center gap-2">
          <span>📁</span>
          博客目录
        </h3>
      </div>

      {isLoading ? (
        <div className="py-6 text-center text-white/60 text-sm">加载中...</div>
      ) : (
        <div className="space-y-1 max-h-80 overflow-y-auto scrollbar-hide">
          {folders.map((folder) => (
            <FolderItem key={folder.id} folder={folder} level={0} activeId={activeId} onSelect={handleSelect} />
          ))}
        </div>
      )}

      {isLoggedIn && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <button
            onClick={() => navigate('/blog?compose=1&folder=root')}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-blue-400/20 to-purple-400/20 text-white/85 hover:text-white hover:from-blue-400/30 hover:to-purple-400/30 transition-all border border-white/10"
          >
            <span>📝</span>
            <span className="font-medium">新建文章</span>
          </button>
        </div>
      )}
    </div>
  )
}
