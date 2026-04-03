import { motion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import { CalendarWidget } from './CalendarWidget'

const navItems = [
  { name: '首页', icon: '🏠', path: '/', enabled: true },
  { name: '相册', icon: '📸', path: '/albums', enabled: true },
  { name: '博客', icon: '📝', path: '/blog', enabled: true },
  { name: '项目', icon: '💻', path: '/projects', enabled: false },
  { name: '关于', icon: '🌟', path: '/about', enabled: false },
]

export function RightSidebar() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <motion.div
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
      className="h-full"
    >
      <div className="sticky top-6 space-y-6">
        {/* 导航面板 */}
        <motion.div
          whileHover={{ scale: 1.01 }}
          className="glass-panel rounded-4xl p-4"
        >
          <h3 className="text-white/90 font-semibold mb-4 px-2 flex items-center gap-2">
            <span className="text-lg">🧭</span>
            导航
          </h3>
          <nav className="space-y-1">
            {navItems.map((item, index) => {
              const isActive = item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path)

              return (
              <motion.button
                key={item.name}
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                whileHover={{ x: 4 }}
                disabled={!item.enabled}
                onClick={() => {
                  if (item.enabled) {
                    navigate(item.path)
                  }
                }}
                className={`w-full nav-item flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
                  isActive
                    ? 'bg-white/30 text-white'
                    : item.enabled
                      ? 'text-white/70 hover:text-white'
                      : 'text-white/40 cursor-not-allowed'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="font-medium">{item.name}</span>
                {!item.enabled && (
                  <span className="ml-auto text-xs text-white/30">敬请期待</span>
                )}
                {isActive && (
                  <motion.div
                    layoutId="active-indicator"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-gradient-to-r from-blue-400 to-pink-400"
                  />
                )}
              </motion.button>
              )
            })}
          </nav>
        </motion.div>

        {/* 日历组件 */}
        <CalendarWidget />
      </div>
    </motion.div>
  )
}
