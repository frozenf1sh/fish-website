import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MarkdownViewer } from './MarkdownViewer'
import { clients } from '../lib/connect'
import { useStore } from '../store/useStore'

type TimelineItemType = 'post' | 'system' | 'blog' | 'album'

interface TimelineItem {
  id: string
  type: TimelineItemType
  timestamp: string
  content: string
  images?: string[]
  meta?: {
    title?: string
    albumName?: string
    imageCount?: number
    readTime?: number
  }
}

const TimelineNode = ({ type, index }: { type: TimelineItemType; index: number }) => {
  const getIcon = () => {
    switch (type) {
      case 'post':
        return '💬'
      case 'system':
        return '🔔'
      case 'blog':
        return '📝'
      case 'album':
        return '📸'
      default:
        return '✨'
    }
  }

  const getColor = () => {
    switch (type) {
      case 'post':
        return 'from-blue-400 to-cyan-400'
      case 'system':
        return 'from-purple-400 to-pink-400'
      case 'blog':
        return 'from-green-400 to-emerald-400'
      case 'album':
        return 'from-pink-400 to-rose-400'
      default:
        return 'from-gray-400 to-gray-500'
    }
  }

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.1 + index * 0.1, type: 'spring' }}
      className="relative"
    >
      <div className={`absolute left-0 top-0 w-10 h-10 rounded-full bg-gradient-to-br ${getColor()} flex items-center justify-center text-lg shadow-lg z-10`}>
        {getIcon()}
      </div>
      <motion.div
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 2, repeat: Infinity, delay: index * 0.3 }}
        className={`absolute left-1 top-1 w-8 h-8 rounded-full bg-gradient-to-br ${getColor()} opacity-30 blur-sm`}
      />
    </motion.div>
  )
}

const PostCard = ({ item, index, onDelete }: { item: TimelineItem; index: number; onDelete?: (id: string) => void }) => {
  const isShortContent = item.content.length < 200
  const { settings, isLoggedIn } = useStore()
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  
  const displayName = settings?.displayName || 'FrozenFish'
  const avatarUrl = settings?.avatarUrl

  const handleDelete = async () => {
    if (!window.confirm('确定要删除这条动态吗？')) return
    try {
      await clients.post.deletePost({ id: item.id })
      onDelete?.(item.id)
    } catch (err) {
      console.error('Failed to delete post:', err)
      alert('删除失败，请重试')
    }
  }

  return (
    <motion.div
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 0.2 + index * 0.1 }}
      whileHover={{ scale: 1.01, y: -2 }}
      className="glass-card rounded-4xl p-6 transition-all cursor-pointer relative group"
    >
      {isLoggedIn && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleDelete()
          }}
          className="absolute top-4 right-4 p-2 rounded-xl bg-red-500/20 text-red-300 opacity-0 group-hover:opacity-100 hover:bg-red-500/40 hover:text-white transition-all"
          title="删除"
        >
          🗑️
        </button>
      )}
      <div className="flex gap-4">
        <div className="flex-shrink-0">
          {avatarUrl ? (
            <div className="w-12 h-12 rounded-full overflow-hidden border border-white/20 shadow-lg">
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400 flex items-center justify-center text-white text-xl shadow-lg">
              🌸
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-white font-semibold">{displayName}</span>
            <span className="text-white/40 text-sm">· {item.timestamp}</span>
          </div>

          {isShortContent ? (
            <p className="text-white/90 whitespace-pre-line mb-4 leading-relaxed">
              {item.content}
            </p>
          ) : (
            <div className="mb-4">
              <MarkdownViewer content={item.content} />
            </div>
          )}

          {item.images && item.images.length > 0 && (
            <div className={`grid gap-2 mb-4 ${item.images.length === 1 ? 'grid-cols-1' : item.images.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {item.images.slice(0, 9).map((url, i) => (
                <div key={i} className="aspect-square rounded-2xl overflow-hidden border border-white/20">
                  {url ? (
                    <img
                      src={url}
                      alt={`Image ${i + 1}`}
                      className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedImage(url)
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-200/30 via-purple-200/30 to-pink-200/30 flex items-center justify-center">
                      <span className="text-4xl opacity-60">🖼️</span>
                    </div>
                  )}
                </div>
              ))}
              {item.images.length > 9 && (
                <div className="aspect-square rounded-2xl bg-black/40 flex items-center justify-center">
                  <span className="text-white text-2xl font-bold">+{item.images.length - 9}</span>
                </div>
              )}
            </div>
          )}

          {/* 暂时隐藏点赞等功能
          <div className="flex items-center gap-6 text-white/60">
            <button className="flex items-center gap-2 hover:text-pink-300 transition-colors">
              <span className="text-lg">💬</span>
              <span className="text-sm">12</span>
            </button>
            <button className="flex items-center gap-2 hover:text-blue-300 transition-colors">
              <span className="text-lg">🔄</span>
              <span className="text-sm">8</span>
            </button>
            <button className="flex items-center gap-2 hover:text-pink-400 transition-colors">
              <span className="text-lg">❤️</span>
              <span className="text-sm">42</span>
            </button>
            <button className="flex items-center gap-2 hover:text-blue-400 transition-colors ml-auto">
              <span className="text-lg">📤</span>
            </button>
          </div>
          */}
        </div>
      </div>

      {createPortal(
        <AnimatePresence>
          {selectedImage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm cursor-zoom-out"
              onClick={(e) => {
                e.stopPropagation()
                setSelectedImage(null)
              }}
            >
              <motion.img
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                src={selectedImage}
                alt="Enlarged"
                className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg shadow-2xl"
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedImage(null)
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </motion.div>
  )
}

const SystemCard = ({ item, index }: { item: TimelineItem; index: number }) => {
  return (
    <motion.div
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 0.2 + index * 0.1 }}
      whileHover={{ scale: 1.01 }}
      className="glass-light rounded-4xl p-5 transition-all cursor-pointer"
    >
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <p className="text-white/85 leading-relaxed">
            {item.content}
          </p>
          <p className="text-white/40 text-sm mt-2">
            {item.timestamp}
          </p>
        </div>
        {item.meta?.imageCount && (
          <div className="glass-panel px-3 py-1.5 rounded-full">
            <span className="text-white/80 text-sm">+{item.meta.imageCount} 张</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

const BlogCard = ({ item, index }: { item: TimelineItem; index: number }) => {
  return (
    <motion.div
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 0.2 + index * 0.1 }}
      whileHover={{ scale: 1.01, y: -2 }}
      className="glass-card rounded-4xl p-6 transition-all cursor-pointer overflow-hidden relative"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400 z-10"></div>
      <div className="mt-1">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-green-300">📝</span>
          <span className="text-white/60 text-sm">新文章</span>
          {item.meta?.readTime && (
            <span className="text-white/40 text-sm ml-auto">⏱️ {item.meta.readTime} 分钟阅读</span>
          )}
        </div>
        {item.meta?.title && (
          <h3 className="text-xl font-bold text-white mb-3 text-gradient">
            {item.meta.title}
          </h3>
        )}
        <div className="text-white/75 text-sm leading-relaxed line-clamp-3">
          {item.content.replace(/#+.*\n/g, '').substring(0, 150)}...
        </div>
        <p className="text-white/40 text-sm mt-3">
          {item.timestamp}
        </p>
      </div>
    </motion.div>
  )
}

const AlbumCard = ({ item, index }: { item: TimelineItem; index: number }) => {
  return (
    <motion.div
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 0.2 + index * 0.1 }}
      whileHover={{ scale: 1.01, y: -2 }}
      className="glass-card rounded-4xl p-6 transition-all cursor-pointer overflow-hidden relative"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-400 via-rose-400 to-red-400 z-10"></div>
      <div className="mt-1 flex items-center gap-4">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-pink-300/30 via-rose-300/30 to-red-300/30 flex items-center justify-center border border-white/20">
          <span className="text-3xl">📸</span>
        </div>
        <div className="flex-1">
          <p className="text-white/90 font-medium">
            {item.content}
          </p>
          <p className="text-white/40 text-sm mt-1">
            {item.timestamp}
          </p>
        </div>
        <div className="text-white/60">
          →
        </div>
      </div>
    </motion.div>
  )
}

export function Timeline() {
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadPosts = async () => {
      try {
        const response = await clients.post.listPosts()
        const items: TimelineItem[] = response.posts.map((post: any) => {
          let timestampStr = '刚刚'
          if (post.createdAt) {
            const date = typeof post.createdAt.toDate === 'function' ? post.createdAt.toDate() : new Date(post.createdAt)
            timestampStr = date.toLocaleString('zh-CN', {
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })
          }
          return {
            id: post.id,
            type: 'post',
            timestamp: timestampStr,
            content: post.content,
            images: post.imageUrls || [],
          }
        })
        setTimelineItems(items)
      } catch (error) {
        console.error('Failed to load posts:', error)
        // Fallback to empty state
        setTimelineItems([])
      } finally {
        setIsLoading(false)
      }
    }

    loadPosts()
  }, [])

  return (
    <div className="relative pl-14">
      {/* 垂直线条 */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-400/50 via-purple-400/50 to-pink-400/50 rounded-full"></div>

      <div className="space-y-4 pb-8">
        {isLoading ? (
          <div className="text-center py-12 text-white/50">
            <p>加载中...</p>
          </div>
        ) : timelineItems.length === 0 ? (
          <div className="text-center py-12 text-white/50">
            <p className="text-4xl mb-4">🌸</p>
            <p>还没有动态，快来发布第一条吧！</p>
          </div>
        ) : (
          timelineItems.map((item, index) => (
            <div key={item.id} className="relative">
              <TimelineNode type={item.type} index={index} />
              <div className="ml-14">
                {item.type === 'post' && <PostCard item={item} index={index} onDelete={id => setTimelineItems(prev => prev.filter(i => i.id !== id))} />}
                {item.type === 'system' && <SystemCard item={item} index={index} />}
                {item.type === 'blog' && <BlogCard item={item} index={index} />}
                {item.type === 'album' && <AlbumCard item={item} index={index} />}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 加载更多指示器 */}
      {!isLoading && timelineItems.length > 0 && (
        <div className="text-center py-8 ml-14">
          <div className="inline-flex items-center gap-2 text-white/60 glass-light px-6 py-3 rounded-full">
            <div className="w-2 h-2 rounded-full bg-white/60 animate-bounce"></div>
            <div className="w-2 h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-2 h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            <span className="ml-2">加载更多动态...</span>
          </div>
        </div>
      )}
    </div>
  )
}
