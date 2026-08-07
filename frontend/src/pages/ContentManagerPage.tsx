import { useEffect, useState } from 'react'
import { clients } from '../lib/connect'
import { useStore } from '../store/useStore'

type ImageOption = { id: string; url: string; fileName: string }
type Project = Awaited<ReturnType<typeof clients.projects.list>>[number]
type AboutData = Awaited<ReturnType<typeof clients.about.get>>
type Article = Awaited<ReturnType<typeof clients.blog.listArticles>>['articles'][number]
export function ContentManagerPage() {
  const isLoggedIn = useStore((state) => state.isLoggedIn)
  const [projects, setProjects] = useState<Project[]>([])
  const [about, setAbout] = useState<AboutData | null>(null)
  const [articles, setArticles] = useState<Article[]>([])
  const [images, setImages] = useState<ImageOption[]>([])
  const [form, setForm] = useState({ id: '', title: '', summary: '', linkUrl: '', coverImageId: '' })
  const [aboutImageId, setAboutImageId] = useState('')
  const load = async () => { const [p, a, blog, albums] = await Promise.all([clients.projects.list(), clients.about.get(), clients.blog.listArticles({ pageSize: 200, status: 'published' }), clients.album.listAlbums({ pageSize: 50 })]); setProjects(p); setAbout(a); setArticles(blog.articles); const all: ImageOption[] = []; for (const album of albums.albums) { const detail = await clients.album.getAlbum({ albumId: album.id }); all.push(...detail.images.map((image) => ({ id: image.id, url: image.url, fileName: image.fileName }))) }; setImages(all) }
  useEffect(() => { if (isLoggedIn) load().catch(console.error) }, [isLoggedIn])
  if (!isLoggedIn) return <div className="p-8 text-white/70">请先登录管理员账号。</div>
  const saveProject = async () => { if (!form.title || !form.coverImageId) return; if (form.id) await clients.projects.update(form); else await clients.projects.create(form); setForm({ id: '', title: '', summary: '', linkUrl: '', coverImageId: '' }); await load() }
  return <div className="space-y-5 p-4 sm:p-6 pb-24 xl:pb-6"><h1 className="text-2xl font-semibold text-white">内容管理</h1>
    <section className="glass-card rounded-3xl p-5 space-y-3"><h2 className="text-white font-semibold">项目</h2><input className="content-input" placeholder="项目标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><textarea className="content-input" placeholder="项目简介" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /><input className="content-input" placeholder="项目链接（可选）" value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} /><select className="content-input" value={form.coverImageId} onChange={(e) => setForm({ ...form, coverImageId: e.target.value })}><option value="">选择封面图片</option>{images.map((image) => <option key={image.id} value={image.id}>{image.fileName}</option>)}</select><button className="btn-primary rounded-xl px-4 py-2 text-white" onClick={saveProject}>{form.id ? '保存项目' : '新增项目'}</button>{projects.map((project) => <div key={project.id} className="flex items-center justify-between border-t border-white/10 pt-3 text-white/80"><span>{project.title}</span><div className="flex gap-2"><button className="text-xs text-white/60" onClick={() => setForm({ id: project.id, title: project.title, summary: project.summary, linkUrl: project.linkUrl, coverImageId: project.coverImage?.id || '' })}>编辑</button><button className="text-xs text-pink-300" onClick={async () => { await clients.projects.remove({ id: project.id }); await load() }}>删除</button></div></div>)}</section>
    <section className="glass-card rounded-3xl p-5 space-y-3"><h2 className="text-white font-semibold">关于页</h2><div className="space-y-2"><label className="block text-sm text-white/70">关于页引用博客</label><div className="flex gap-2"><select className="content-input flex-1" value={about?.featuredArticleId || ''} onChange={async (e) => { await clients.about.setFeaturedArticle(e.target.value); await load() }}><option value="">不引用博客，显示个人简介</option>{articles.map((article) => <option key={article.id} value={article.id}>{article.title}</option>)}</select></div><p className="text-xs text-white/45">公开关于页会以大卡片形式复用这篇博客的标题、正文和 Markdown 渲染。</p></div><div className="flex gap-2"><select className="content-input flex-1" value={aboutImageId} onChange={(e) => setAboutImageId(e.target.value)}><option value="">选择照片</option>{images.map((image) => <option key={image.id} value={image.id}>{image.fileName}</option>)}</select><button className="btn-primary rounded-xl px-4 text-white" onClick={async () => { if (aboutImageId) { await clients.about.addImage(aboutImageId); setAboutImageId(''); await load() } }}>添加照片</button></div><div className="grid grid-cols-3 gap-2">{about?.images?.map((item) => <div key={item.id} className="relative">{item.image?.url && <img src={item.image.url} className="aspect-square w-full rounded-xl object-cover" /> }<button className="absolute right-1 top-1 rounded-lg bg-black/60 px-2 py-1 text-xs text-white" onClick={async () => { await clients.about.removeImage(item.id); await load() }}>删除</button></div>)}</div></section>
  </div>
}
export default ContentManagerPage
