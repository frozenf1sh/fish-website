import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { clients } from '../lib/connect'

type Project = Awaited<ReturnType<typeof clients.projects.list>>[number]

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { clients.projects.list().then(setProjects).catch(console.error).finally(() => setLoading(false)) }, [])
  return <div className="space-y-4 p-4 sm:p-6 pb-24 xl:pb-6">
    <header className="mb-2"><p className="text-white/50 text-xs uppercase tracking-[0.25em]">Projects</p><h1 className="text-2xl font-semibold text-white mt-1">项目</h1></header>
    {loading ? <div className="text-white/60 py-12 text-center">正在加载项目…</div> : projects.length === 0 ? <div className="glass-card rounded-3xl p-8 text-center text-white/60">还没有项目内容</div> : <div className="space-y-4">
      {projects.map((project, index) => <motion.article key={project.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="glass-card overflow-hidden rounded-3xl">
        {project.coverImage?.url && <img src={project.coverImage.url} alt={project.title} className="w-full aspect-[16/7] object-cover" loading={index > 1 ? 'lazy' : 'eager'} />}
        <div className="p-5"><h2 className="text-lg font-semibold text-white">{project.title}</h2><p className="mt-2 text-sm leading-6 text-white/65 whitespace-pre-wrap">{project.summary}</p>{project.linkUrl && <a className="inline-flex mt-4 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20" href={project.linkUrl} target="_blank" rel="noreferrer">查看项目 ↗</a>}</div>
      </motion.article>)}
    </div>}
  </div>
}

export default ProjectsPage
