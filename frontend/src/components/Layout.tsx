import { motion } from 'framer-motion'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LeftSidebar } from './LeftSidebar'
import { RightSidebar } from './RightSidebar'
import { useStore } from '../store/useStore'

const mobileTabs = [
  { icon: '🏠', label: '首页', path: '/' },
  { icon: '📸', label: '相册', path: '/albums' },
  { icon: '🔎', label: '搜索', path: '/search' },
  { icon: '📝', label: '博客', path: '/blog' },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 21a8 8 0 0 0-16 0" />
        <circle cx="12" cy="8" r="4" />
      </svg>
    ),
    label: '我',
    path: '/me',
  },
]

export function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const avatarUrl = useStore((state) => state.settings?.avatarUrl)

  return (
    <div className="min-h-screen">
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 backdrop-blur-xl border-b border-white/20 bg-black/20">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-white"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="w-7 h-7 rounded-full object-cover border border-white/30" />
            ) : (
              <span className="w-7 h-7 rounded-full bg-white/20 border border-white/30 flex items-center justify-center text-sm">🐟</span>
            )}
            <span className="text-sm font-semibold tracking-wide">冻鱼的小站</span>
          </button>
          <button
            onClick={() => navigate('/search')}
            className="w-9 h-9 rounded-full bg-white/20 text-white/90 flex items-center justify-center"
            aria-label="前往搜索"
          >
            🔎
          </button>
        </div>
      </div>

      <div className="max-w-[1680px] mx-auto px-4 sm:px-6 pb-24 lg:pb-6 pt-20 lg:pt-6">
        <div className="grid gap-4 xl:gap-6 xl:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(240px,280px)] items-start">
          {/* 左栏与右栏保持同一固定轨道宽度 */}
          <motion.aside
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="hidden xl:block min-w-0"
          >
            <LeftSidebar />
          </motion.aside>

          {/* 中栏自适应剩余空间 */}
          <motion.main
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="min-w-0 w-full border-x border-white/10"
          >
            <Outlet />
          </motion.main>

          {/* 右栏在常见桌面宽度（>=1280px）显示，并与左栏等宽 */}
          <motion.aside
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="hidden xl:block min-w-0"
          >
            <RightSidebar />
          </motion.aside>
        </div>
      </div>

      {/* 移动端底部导航 */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 backdrop-blur-xl border-t border-white/20 bg-black/30 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
        <div className="grid grid-cols-5 gap-1 items-center px-2 pt-2">
          {mobileTabs.map(({ icon, label, path }) => {
            const isActive = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
            return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`w-full min-w-0 flex flex-col items-center justify-center gap-1 py-2 rounded-2xl transition-all ${isActive ? 'bg-white/25 text-white' : 'text-white/70'}`}
            >
              <span className="text-xl leading-none flex items-center justify-center">{icon}</span>
              <span className="text-[11px] tracking-wide truncate">{label}</span>
            </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
