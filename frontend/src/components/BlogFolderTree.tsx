import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { clients } from '../lib/connect'
import { useStore } from '../store/useStore'
import { showToast } from '../lib/toast'
import { ConfirmDialog } from './ConfirmDialog'

interface Folder {
  id: string
  name: string
  articleCount: number
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
        <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/80">{folder.articleCount}</span>
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
  const [creatingName, setCreatingName] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [confirmDeleteFolderOpen, setConfirmDeleteFolderOpen] = useState(false)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isLoggedIn = useStore((state) => state.isLoggedIn)
  const activeId = searchParams.get('folder') || 'root'

  useEffect(() => {
    const loadFolders = async () => {
      setIsLoading(true)
      try {
        const response = await clients.blog.listArticles({ pageSize: 1000, folderId: '', status: 'published' })
        const apiFolders = (response.folders || []) as ApiFolder[]
        const allArticles = (response.articles || []) as Array<{ folderId?: string }>

        const directCounts = new Map<string, number>()
        for (const article of allArticles) {
          const id = article.folderId || 'root'
          directCounts.set(id, (directCounts.get(id) || 0) + 1)
        }

        const toFolder = (f: ApiFolder): Folder => {
          const children = (f.children || []).map((item) => toFolder(item))
          const nestedCount = children.reduce((sum, item) => sum + item.articleCount, 0)
          const selfCount = directCounts.get(f.id) || 0
          return {
            id: f.id,
            name: f.name || '未命名文件夹',
            articleCount: selfCount + nestedCount,
            children,
          }
        }

        let normalized = apiFolders.length > 0 ? apiFolders.map((item) => toFolder(item)) : []
        if (!normalized.some((item) => item.id === 'root')) {
          const nestedCount = normalized.reduce((sum, item) => sum + item.articleCount, 0)
          const rootCount = directCounts.get('root') || 0
          normalized = [{ id: 'root', name: '根目录', articleCount: rootCount + nestedCount, children: normalized }]
        }
        setFolders(normalized)
      } catch (err) {
        console.error('load folders failed', err)
        setFolders([{ id: 'root', name: '根目录', articleCount: 0, children: [] }])
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

  const createChildFolder = async () => {
    const name = creatingName.trim()
    if (!name) {
      showToast({ type: 'warning', message: '请输入文件夹名称' })
      return
    }

    setIsCreatingFolder(true)
    try {
      await clients.blog.createFolder({
        name,
        parentFolderId: activeId,
      })
      setCreatingName('')
      showToast({ type: 'success', message: '子文件夹已创建' })
      window.dispatchEvent(new Event('blog:updated'))
    } catch (err) {
      console.error('create child folder failed', err)
      showToast({ type: 'error', message: '创建文件夹失败，请重试' })
    } finally {
      setIsCreatingFolder(false)
    }
  }

  const deleteCurrentFolder = async () => {
    if (activeId === 'root') {
      showToast({ type: 'warning', message: '根目录不能删除' })
      return
    }
    try {
      await clients.blog.deleteFolder({ folderId: activeId })
      showToast({ type: 'success', message: '文件夹已删除，文章已回收到根目录' })
      const next = new URLSearchParams(searchParams)
      next.set('folder', 'root')
      next.delete('compose')
      navigate({ pathname: '/blog', search: next.toString() })
      window.dispatchEvent(new Event('blog:updated'))
    } catch (err) {
      console.error('delete folder failed', err)
      showToast({ type: 'error', message: '删除文件夹失败，请重试' })
    }
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
          <div className="space-y-2">
            <button
              onClick={() => navigate('/blog?compose=1&folder=root')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-blue-400/20 to-purple-400/20 text-white/85 hover:text-white hover:from-blue-400/30 hover:to-purple-400/30 transition-all border border-white/10"
            >
              <span>📝</span>
              <span className="font-medium">新建文章</span>
            </button>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center min-w-0">
              <input
                value={creatingName}
                onChange={(e) => setCreatingName(e.target.value)}
                placeholder="在当前目录创建子文件夹"
                className="w-full min-w-0 px-3 py-2 rounded-xl bg-white/10 text-white text-sm border border-white/20 placeholder:text-white/45"
              />
              <button
                onClick={createChildFolder}
                disabled={isCreatingFolder || !creatingName.trim()}
                className="px-3 py-2 rounded-xl border border-white/30 text-white/90 hover:bg-white/10 disabled:opacity-50 whitespace-nowrap"
              >
                新建
              </button>
            </div>

            {activeId !== 'root' && (
              <button
                onClick={() => setConfirmDeleteFolderOpen(true)}
                className="w-full px-3 py-2 rounded-xl border border-red-300/40 text-red-100 bg-red-500/20 hover:bg-red-500/35"
              >
                删除当前目录（子目录与文章归根）
              </button>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteFolderOpen}
        title="删除目录"
        message="确定删除当前目录吗？其子目录会一起删除，目录内文章会移动到根目录。"
        confirmText="确认删除"
        cancelText="取消"
        danger
        onCancel={() => setConfirmDeleteFolderOpen(false)}
        onConfirm={async () => {
          await deleteCurrentFolder()
          setConfirmDeleteFolderOpen(false)
        }}
      />
    </div>
  )
}
