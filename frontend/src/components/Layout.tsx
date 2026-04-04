import { motion } from 'framer-motion'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LeftSidebar } from './LeftSidebar'
import { RightSidebar } from './RightSidebar'
 
const mobileTabs = [
  { icon: '🏠', label: '首页', path: '/' },
  { icon: '🔎', label: '搜索', path: '/search' },
  { icon: '📸', label: '相册', path: '/albums' },
  { icon: '📝', label: '博客', path: '/blog' },
]

export function Layout() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen">
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 backdrop-blur-xl border-b border-white/20 bg-black/20">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-white"
          >
            <span className="text-xl">𝕏</span>
            <span className="text-sm font-semibold tracking-wide">FISH FEED</span>
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

      <div className="max-w-7xl mx-auto px-0 sm:px-4 pb-24 lg:pb-6 pt-20 lg:pt-6">
        <div className="flex gap-0 lg:gap-6">
          {/* 左栏 - 25% */}
          <motion.aside
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="hidden lg:block lg:w-[25%] lg:min-w-[280px]"
          >
            <LeftSidebar />
          </motion.aside>

          {/* 中栏 - 45% */}
          <motion.main
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex-1 min-w-0 w-full lg:basis-[45%] lg:max-w-[45%] border-x border-white/10"
          >
            <Outlet />
          </motion.main>

          {/* 右栏 - 30% */}
          <motion.aside
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="hidden xl:block xl:w-[30%] xl:min-w-[320px]"
          >
            <RightSidebar />
          </motion.aside>
        </div>
      </div>

      {/* 移动端底部导航 */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 backdrop-blur-xl border-t border-white/20 bg-black/30 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
        <div className="flex justify-around items-center px-3 pt-2">
          {mobileTabs.map(({ icon, label, path }) => {
            const isActive = location.pathname === path
            return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center justify-center gap-1 min-w-20 py-2 rounded-2xl transition-all ${isActive ? 'bg-white/25 text-white' : 'text-white/70'}`}
            >
              <span className="text-xl leading-none">{icon}</span>
              <span className="text-[11px] tracking-wide">{label}</span>
            </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
