import { motion } from 'framer-motion'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LeftSidebar } from './LeftSidebar'
import { RightSidebar } from './RightSidebar'
 
const mobileTabs = [
  { icon: '🏠', path: '/' },
  { icon: '📸', path: '/albums' },
  { icon: '📝', path: '/blog' },
]

export function Layout() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* 左栏 - 25% */}
          <motion.aside
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="hidden lg:block"
            style={{ width: '25%', minWidth: '280px' }}
          >
            <LeftSidebar />
          </motion.aside>

          {/* 中栏 - 45% */}
          <motion.main
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex-1 min-w-0"
            style={{ flex: '0 0 45%', maxWidth: '45%' }}
          >
            <Outlet />
          </motion.main>

          {/* 右栏 - 30% */}
          <motion.aside
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="hidden xl:block"
            style={{ width: '30%', minWidth: '320px' }}
          >
            <RightSidebar />
          </motion.aside>
        </div>
      </div>

      {/* 移动端底部导航 */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 glass-panel border-t border-white/20 pb-safe">
        <div className="flex justify-around items-center p-4">
          {mobileTabs.map(({ icon, path }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`p-3 rounded-2xl ${location.pathname === path ? 'bg-white/30' : ''}`}
            >
              <span className="text-2xl">{icon}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
