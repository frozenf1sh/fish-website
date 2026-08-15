import { useState } from 'react'
import { motion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import { CalendarWidget } from './CalendarWidget'

const navItems = [
  { name: '首页', icon: '🏠', path: '/', enabled: true },
  { name: '相册', icon: '📸', path: '/albums', enabled: true },
  { name: '博客', icon: '📝', path: '/blog', enabled: true },
  { name: '项目', icon: '💻', path: '/projects', enabled: true },
  { name: '关于', icon: '🌟', path: '/about', enabled: true },
]

export function RightSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')

  return (
    <motion.div
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
      className="h-full"
    >
      <div className="sticky top-0 space-y-4">
        <motion.form
          onSubmit={(e) => {
            e.preventDefault()
            navigate(`/search?q=${encodeURIComponent(keyword.trim())}`)
          }}
          className="glass-panel rounded-4xl p-3"
        >
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索内容..."
            className="glass-input"
          />
        </motion.form>

        {/* 导航面板 */}
        <motion.div
          whileHover={{ scale: 1.01 }}
          className="glass-panel rounded-4xl p-3"
        >
          <nav className="space-y-0.5">
            {navItems.map((item, index) => {
              const isActive = item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path)

              return (
              <motion.button
                key={item.name}
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                whileFocus={{ x: 4 }}
                transition={{
                  x: { duration: 0.12, ease: 'easeOut' },
                  scale: { duration: 0.1, ease: 'easeOut' },
                  opacity: { delay: 0.5 + index * 0.1, duration: 0.2 },
                }}
                disabled={!item.enabled}
                onClick={() => {
                  if (item.enabled) {
                    navigate(item.path)
                  }
                }}
                className={`w-full nav-item flex items-center gap-3 px-3.5 py-2.5 rounded-2xl transition-colors duration-100 ${
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
