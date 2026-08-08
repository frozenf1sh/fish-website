import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { clients } from '../lib/connect'
import { ArticleReader } from '../components/ArticleReader'
import type { BlogArticle } from '../shared/domain/content'

export function AboutPage() {
  const [about, setAbout] = useState<Awaited<ReturnType<typeof clients.about.get>> | null>(null)
  const [article, setArticle] = useState<BlogArticle | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await clients.about.get()
        if (cancelled) return
        setAbout(data)
        if (data.featuredArticleId) {
          const response = await clients.blog.getArticle({ articleId: data.featuredArticleId })
          if (!cancelled) setArticle(response.article as BlogArticle | null)
        }
      } catch (error) {
        console.error('Failed to load about page:', error)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const settings = about?.settings

  return (
    <div className="space-y-5 px-4 sm:px-6 pb-24 xl:pb-6">
      <div className="lg:hidden">
        {isLoading ? (
          <section className="glass-card rounded-3xl h-24 sm:h-64 animate-pulse" aria-label="正在加载关于页" />
        ) : (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-3xl p-3 sm:p-6 flex items-center gap-3 sm:block sm:text-center">
            {settings?.avatarUrl ? <img src={settings.avatarUrl} alt={settings.displayName || '头像'} className="h-16 w-16 sm:mx-auto sm:h-40 sm:w-40 shrink-0 rounded-full object-cover border-2 sm:border-4 border-white/30 shadow-2xl" /> : <div className="h-16 w-16 sm:mx-auto sm:h-40 sm:w-40 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-3xl sm:text-5xl">🐟</div>}
            <div className="min-w-0">
              <h2 className="text-lg sm:mt-5 sm:text-2xl font-semibold text-white truncate">{settings?.displayName || '冻鱼'}</h2>
              <p className="mt-1 sm:mt-3 mx-auto max-w-2xl text-left whitespace-pre-wrap text-sm leading-6 sm:leading-7 text-white/70 line-clamp-2 sm:line-clamp-none">{settings?.bio || '欢迎来到我的小站。'}</p>
            </div>
          </motion.section>
        )}
      </div>

      {!isLoading && article && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <ArticleReader article={article} className="min-h-[70vh]" />
        </motion.div>
      )}

      {(about?.images.length ?? 0) > 0 && <section className="columns-1 sm:columns-2 gap-4 space-y-4">{about?.images.map((item, index) => item.image?.url && <motion.img key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.04 }} src={item.image.url} alt="关于我的照片" loading="lazy" className="mb-4 w-full break-inside-avoid rounded-3xl border border-white/15 object-cover" />)}</section>}
    </div>
  )
}

export default AboutPage
