import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { clients } from '../lib/connect'
import { useStore } from '../store/useStore'
import { ImageUploadButton } from '../components/ImageUploadButton'
import { GitHubActivityCard } from '../components/GitHubActivityCard'

type Project = Awaited<ReturnType<typeof clients.projects.list>>[number]
type ProjectForm = { id: string; title: string; summary: string; linkUrl: string; coverImageId: string }

const emptyForm: ProjectForm = { id: '', title: '', summary: '', linkUrl: '', coverImageId: '' }

export function ProjectsPage() {
  const isLoggedIn = useStore((state) => state.isLoggedIn)
  const [projects, setProjects] = useState<Project[]>([])
  const [form, setForm] = useState<ProjectForm>(emptyForm)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const loadProjects = async () => {
    const result = await clients.projects.list()
    setProjects(result)
  }

  useEffect(() => {
    loadProjects().catch(console.error).finally(() => setLoading(false))
  }, [])

  const saveProject = async () => {
    if (!form.title.trim() || !form.coverImageId) return
    setIsSaving(true)
    try {
      if (form.id) await clients.projects.update(form)
      else await clients.projects.create(form)
      setForm(emptyForm)
      setIsEditorOpen(false)
      await loadProjects()
    } finally {
      setIsSaving(false)
    }
  }

  const editProject = (project: Project) => {
    setForm({
      id: project.id,
      title: project.title,
      summary: project.summary,
      linkUrl: project.linkUrl,
      coverImageId: project.coverImage?.id || '',
    })
    setIsEditorOpen(true)
  }

  const deleteProject = async (project: Project) => {
    if (!window.confirm(`确定删除项目“${project.title}”吗？`)) return
    await clients.projects.remove({ id: project.id })
    if (form.id === project.id) { setForm(emptyForm); setIsEditorOpen(false) }
    await loadProjects()
  }

  return (
    <div className="space-y-4 p-4 sm:p-6 pb-24 xl:pb-6">
      <GitHubActivityCard />
      {isLoggedIn && <div className="flex justify-end"><button type="button" onClick={() => { setForm(emptyForm); setIsEditorOpen(true) }} className="btn-primary rounded-xl px-4 py-2 text-white">新建项目</button></div>}

      {isLoggedIn && isEditorOpen && (
        <section className="glass-card rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-white font-semibold">{form.id ? '编辑项目' : '新建项目'}</h2><button type="button" onClick={() => { setForm(emptyForm); setIsEditorOpen(false) }} className="text-sm text-white/60 hover:text-white">取消</button></div>
          <input className="content-input" placeholder="项目标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea className="content-input" placeholder="项目简介" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          <input className="content-input" placeholder="项目 URL" value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} />
          <div className="flex flex-wrap items-center gap-3"><ImageUploadButton label="上传封面到默认相册" onUploaded={(image) => setForm((current) => ({ ...current, coverImageId: image.id }))} /><span className="text-xs text-white/50">{form.coverImageId ? '已选择封面，保存后会维护项目引用' : '请选择一张封面图片'}</span></div>
          <button type="button" disabled={isSaving} onClick={saveProject} className="btn-primary rounded-xl px-4 py-2 text-white disabled:opacity-50">{isSaving ? '保存中…' : '保存项目'}</button>
        </section>
      )}

      {loading ? <div className="text-white/60 py-12 text-center">正在加载项目…</div> : projects.length === 0 ? <div className="glass-card rounded-3xl p-8 text-center text-white/60">还没有项目内容</div> : <div className="space-y-4">
        {projects.map((project, index) => (
          <motion.article
            key={project.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            onClick={() => project.linkUrl && window.location.assign(project.linkUrl)}
            onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && project.linkUrl) window.location.assign(project.linkUrl) }}
            role={project.linkUrl ? 'link' : undefined}
            tabIndex={project.linkUrl ? 0 : undefined}
            className={`glass-card overflow-hidden rounded-3xl ${project.linkUrl ? 'cursor-pointer hover:ring-2 hover:ring-white/25' : ''}`}
          >
            {project.coverImage?.url && <img src={project.coverImage.url} alt={project.title} className="w-full aspect-[16/7] object-cover" loading={index > 1 ? 'lazy' : 'eager'} />}
            <div className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-white">{project.title}</h2><p className="mt-2 text-sm leading-6 text-white/65 whitespace-pre-wrap">{project.summary}</p></div>{project.linkUrl && <span className="text-white/65 text-xl">↗</span>}</div>
              {isLoggedIn && <div className="mt-4 flex gap-2" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => editProject(project)} className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20">编辑</button><button type="button" onClick={() => deleteProject(project)} className="rounded-xl border border-red-300/30 bg-red-500/15 px-3 py-2 text-sm text-red-100 hover:bg-red-500/30">删除</button></div>}
            </div>
          </motion.article>
        ))}
      </div>}
    </div>
  )
}

export default ProjectsPage
