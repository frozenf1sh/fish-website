import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { clients } from '../lib/connect'

export function AboutPage() {
  const [about, setAbout] = useState<Awaited<ReturnType<typeof clients.about.get>> | null>(null)
  useEffect(() => { clients.about.get().then(setAbout).catch(console.error) }, [])
  const settings = about?.settings
  return <div className="space-y-4 p-4 sm:p-6 pb-24 xl:pb-6">
    <header className="mb-2"><p className="text-white/50 text-xs uppercase tracking-[0.25em]">About</p><h1 className="text-2xl font-semibold text-white mt-1">关于我</h1></header>
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-3xl p-6 text-center">
      {settings?.avatarUrl ? <img src={settings.avatarUrl} alt={settings.displayName || '头像'} className="mx-auto h-40 w-40 rounded-full object-cover border-4 border-white/30 shadow-2xl" /> : <div className="mx-auto h-40 w-40 rounded-full bg-white/10 flex items-center justify-center text-5xl">🐟</div>}
      <h2 className="mt-5 text-2xl font-semibold text-white">{settings?.displayName || '冻鱼'}</h2>
      <p className="mt-3 mx-auto max-w-2xl text-left whitespace-pre-wrap text-sm leading-7 text-white/70">{settings?.bio || '欢迎来到我的小站。'}</p>
    </motion.section>
    {(about?.images.length ?? 0) > 0 && <section className="columns-1 sm:columns-2 gap-4 space-y-4">{about?.images.map((item, index) => item.image?.url && <motion.img key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.04 }} src={item.image.url} alt="关于我的照片" loading="lazy" className="mb-4 w-full break-inside-avoid rounded-3xl border border-white/15 object-cover" />)}</section>}
  </div>
}

export default AboutPage
