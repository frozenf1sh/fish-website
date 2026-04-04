import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { clients } from '../lib/connect'

interface SearchPost {
  id: string
  content: string
  createdAt?: { toDate?: () => Date }
}

interface SearchArticle {
  id: string
  title: string
  content: string
  tags: string[]
}

interface SearchAlbum {
  id: string
  name: string
  description: string
}

const norm = (v: string) => v.trim().toLowerCase()

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const initial = searchParams.get('q') || ''

  const [query, setQuery] = useState(initial)
  const [posts, setPosts] = useState<SearchPost[]>([])
  const [articles, setArticles] = useState<SearchArticle[]>([])
  const [albums, setAlbums] = useState<SearchAlbum[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const q = searchParams.get('q') || ''
    setQuery(q)
  }, [searchParams])

  useEffect(() => {
    const q = searchParams.get('q') || ''
    if (!q.trim()) {
      setPosts([])
      setArticles([])
      setAlbums([])
      return
    }

    const load = async () => {
      setIsLoading(true)
      try {
        const [postRes, blogRes, albumRes] = await Promise.all([
          clients.post.listPosts({ pageSize: 100 }),
          clients.blog.listArticles({ pageSize: 100, status: 'published' }),
          clients.album.listAlbums({ pageSize: 100, onlyPublic: true }),
        ])

        const keyword = norm(q)
        setPosts((postRes.posts || []).filter((item: SearchPost) => norm(item.content || '').includes(keyword)))
        setArticles(
          (blogRes.articles || []).filter(
            (item: SearchArticle) =>
              norm(item.title || '').includes(keyword) ||
              norm(item.content || '').includes(keyword) ||
              (item.tags || []).some((tag) => norm(tag).includes(keyword)),
          ),
        )
        setAlbums(
          (albumRes.albums || []).filter(
            (item: SearchAlbum) =>
              norm(item.name || '').includes(keyword) || norm(item.description || '').includes(keyword),
          ),
        )
      } catch (err) {
        console.error('search failed', err)
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [searchParams])

  const total = useMemo(() => posts.length + articles.length + albums.length, [posts, articles, albums])

  return (
    <div className="space-y-4 sm:space-y-6 pb-8 px-3 sm:px-0">
      <div className="glass-panel rounded-3xl sm:rounded-4xl p-4 sm:p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const next = new URLSearchParams(searchParams)
            if (query.trim()) next.set('q', query.trim())
            else next.delete('q')
            setSearchParams(next)
          }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索动态、文章、相册..."
            className="flex-1 px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20 focus:outline-none"
          />
          <button className="btn-primary px-5 py-3 rounded-2xl text-white">搜索</button>
        </form>
        <p className="text-white/60 text-sm mt-3">共 {total} 条结果</p>
      </div>

      {isLoading ? (
        <div className="glass-card rounded-4xl p-8 text-center text-white/70">搜索中...</div>
      ) : (
        <>
          <motion.div className="glass-card rounded-3xl sm:rounded-4xl p-4 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h3 className="text-white font-semibold mb-3">文章</h3>
            {articles.length === 0 ? <p className="text-white/55 text-sm">暂无文章结果</p> : (
              <div className="space-y-2">
                {articles.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigate(`/blog?article=${item.id}`)}
                    className="w-full text-left rounded-2xl border border-white/15 bg-white/5 px-4 py-3 hover:bg-white/10"
                  >
                    <p className="text-white font-medium">{item.title}</p>
                    <p className="text-white/60 text-sm line-clamp-2 mt-1">{item.content}</p>
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          <motion.div className="glass-card rounded-3xl sm:rounded-4xl p-4 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h3 className="text-white font-semibold mb-3">动态</h3>
            {posts.length === 0 ? <p className="text-white/55 text-sm">暂无动态结果</p> : (
              <div className="space-y-2">
                {posts.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3">
                    <p className="text-white/85 text-sm line-clamp-3">{item.content}</p>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          <motion.div className="glass-card rounded-3xl sm:rounded-4xl p-4 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h3 className="text-white font-semibold mb-3">相册</h3>
            {albums.length === 0 ? <p className="text-white/55 text-sm">暂无相册结果</p> : (
              <div className="space-y-2">
                {albums.map((item) => (
                  <button key={item.id} onClick={() => navigate('/albums')} className="w-full text-left rounded-2xl border border-white/15 bg-white/5 px-4 py-3 hover:bg-white/10">
                    <p className="text-white font-medium">{item.name}</p>
                    <p className="text-white/60 text-sm mt-1 line-clamp-2">{item.description || '无描述'}</p>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </>
      )}
    </div>
  )
}
