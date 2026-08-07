import { useEffect, useState } from 'react'
import { clients } from '../lib/connect'
import { useStore } from '../store/useStore'
import { ImageUploadButton } from '../components/ImageUploadButton'

type ImageOption = { id: string; url: string; fileName: string }
type Project = Awaited<ReturnType<typeof clients.projects.list>>[number]
type AboutData = Awaited<ReturnType<typeof clients.about.get>>
type Article = Awaited<ReturnType<typeof clients.blog.listArticles>>['articles'][number]

const emptyProject = { id: '', title: '', summary: '', linkUrl: '', coverImageId: '' }

export function ContentManagerPage() {
  const isLoggedIn = useStore((state) => state.isLoggedIn)
  const [projects, setProjects] = useState<Project[]>([])
  const [about, setAbout] = useState<AboutData | null>(null)
  const [articles, setArticles] = useState<Article[]>([])
  const [images, setImages] = useState<ImageOption[]>([])
  const [form, setForm] = useState(emptyProject)
  const [aboutImageId, setAboutImageId] = useState('')

  const load = async () => {
    const [projectList, aboutData, blog, albums] = await Promise.all([
      clients.projects.list(),
      clients.about.get(),
      clients.blog.listArticles({ pageSize: 200, status: 'published' }),
      clients.album.listAlbums({ pageSize: 50 }),
    ])
    setProjects(projectList)
    setAbout(aboutData)
    setArticles(blog.articles)

    const allImages: ImageOption[] = []
    for (const album of albums.albums) {
      const detail = await clients.album.getAlbum({ albumId: album.id })
      allImages.push(...detail.images.map((image) => ({ id: image.id, url: image.url, fileName: image.fileName })))
    }
    setImages(allImages)
  }

  useEffect(() => {
    if (isLoggedIn) load().catch(console.error)
  }, [isLoggedIn])

  if (!isLoggedIn) return <div className="p-8 text-white/70">请先登录管理员账号。</div>

  const saveProject = async () => {
    if (!form.title.trim() || !form.coverImageId) return
    if (form.id) await clients.projects.update(form)
    else await clients.projects.create(form)
    setForm(emptyProject)
    await load()
  }

  return (
    <div className="space-y-5 p-4 sm:p-6 pb-24 xl:pb-6">
      <header>
        <p className="text-white/50 text-xs uppercase tracking-[0.25em]">Manage</p>
        <h1 className="text-2xl font-semibold text-white mt-1">内容管理</h1>
      </header>

      <section className="glass-card rounded-3xl p-4 sm:p-5 space-y-4">
        <div>
          <h2 className="text-white font-semibold">项目</h2>
          <p className="mt-1 text-xs text-white/50">封面会上传到默认相册，保存项目后由后端维护图片引用计数。</p>
        </div>
        <input className="content-input" placeholder="项目标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <textarea className="content-input min-h-24 resize-y" placeholder="项目简介" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        <input className="content-input" placeholder="项目链接（可选）" value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} />
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <ImageUploadButton label="上传封面到默认相册" onUploaded={(image) => setForm((current) => ({ ...current, coverImageId: image.id }))} />
          <select className="content-input min-w-0 flex-1" value={form.coverImageId} onChange={(e) => setForm({ ...form, coverImageId: e.target.value })}>
            <option value="">或选择已有封面</option>
            {images.map((image) => <option key={image.id} value={image.id}>{image.fileName}</option>)}
          </select>
        </div>
        <button type="button" className="btn-primary rounded-2xl px-4 py-2.5 text-white" onClick={saveProject}>{form.id ? '保存项目' : '新增项目'}</button>
        <div className="space-y-2">
          {projects.map((project) => (
            <div key={project.id} className="flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-white/80">
              <span className="truncate">{project.title}</span>
              <div className="flex shrink-0 gap-3">
                <button type="button" className="text-sm text-white/60 hover:text-white" onClick={() => setForm({ id: project.id, title: project.title, summary: project.summary, linkUrl: project.linkUrl, coverImageId: project.coverImage?.id || '' })}>编辑</button>
                <button type="button" className="text-sm text-pink-300 hover:text-pink-200" onClick={async () => { await clients.projects.remove({ id: project.id }); await load() }}>删除</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-card rounded-3xl p-4 sm:p-5 space-y-5">
        <div>
          <h2 className="text-white font-semibold">关于页</h2>
          <p className="mt-1 text-xs text-white/50">配置顶部个人卡片、引用博客和关于页照片。</p>
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-white/75">引用博客</label>
          <select className="content-input" value={about?.featuredArticleId || ''} onChange={async (e) => { await clients.about.setFeaturedArticle(e.target.value); await load() }}>
            <option value="">不引用博客，显示个人简介</option>
            {articles.map((article) => <option key={article.id} value={article.id}>{article.title}</option>)}
          </select>
          <p className="text-xs leading-5 text-white/45">引用后，关于页会在个人卡片下方显示完整的 Markdown 博客。</p>
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-white/75">关于页照片</label>
          <div className="flex flex-col sm:flex-row gap-3">
            <select className="content-input min-w-0 flex-1" value={aboutImageId} onChange={(e) => setAboutImageId(e.target.value)}>
              <option value="">选择已有照片</option>
              {images.map((image) => <option key={image.id} value={image.id}>{image.fileName}</option>)}
            </select>
            <button type="button" className="btn-primary rounded-2xl px-4 py-2.5 text-white" onClick={async () => { if (aboutImageId) { await clients.about.addImage(aboutImageId); setAboutImageId(''); await load() } }}>添加照片</button>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2">
            {about?.images?.map((item) => <div key={item.id} className="relative overflow-hidden rounded-2xl border border-white/15">{item.image?.url && <img src={item.image.url} alt="关于页照片" className="aspect-square w-full object-cover" />}<button type="button" className="absolute right-1 top-1 rounded-xl bg-black/60 px-2 py-1 text-xs text-white hover:bg-red-500/70" onClick={async () => { await clients.about.removeImage(item.id); await load() }}>删除</button></div>)}
          </div>
        </div>
      </section>
    </div>
  )
}

export default ContentManagerPage
