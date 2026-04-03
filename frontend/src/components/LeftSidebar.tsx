import { motion } from 'framer-motion'
import { useStore } from '../store/useStore'
import { BlogFolderTree } from './BlogFolderTree'

const socialLinks = [
  { name: 'Twitter', icon: '𝕏', url: '', color: 'from-blue-400 to-cyan-400' },
  { name: 'GitHub', icon: '🐱', url: '', color: 'from-gray-400 to-gray-600' },
  { name: 'Bilibili', icon: '📺', url: '', color: 'from-pink-400 to-rose-400' },
  { name: 'Discord', icon: '💬', url: '', color: 'from-indigo-400 to-purple-500' },
]

export function LeftSidebar() {
  const {
    settings,
    isLoggedIn,
    incrementAvatarClickCount,
    resetAvatarClickCount,
    avatarClickCount,
  } = useStore()

  return (
    <motion.div
      initial={{ x: -50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="h-full"
    >
      <div className="sticky top-6 space-y-6">
        {/* 头像卡片 */}
        <motion.div
          whileHover={{ scale: 1.02 }}
          className="glass-panel rounded-4xl p-8 text-center"
        >
          <div className="relative inline-block mb-6">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 blur-xl opacity-50 avatar-glow"></div>
            <button
              onClick={incrementAvatarClickCount}
              onMouseLeave={resetAvatarClickCount}
              className="relative w-32 h-32 rounded-full overflow-hidden border-4 border-white/50 shadow-2xl hover:scale-105 transition-transform"
            >
              {settings?.avatarUrl ? (
                <img
                  src={settings.avatarUrl}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-300 via-purple-300 to-pink-300 flex items-center justify-center">
                  <span className="text-5xl">🌸</span>
                </div>
              )}
            </button>
            {!isLoggedIn && avatarClickCount > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-white/80 text-xs"
              >
                {5 - avatarClickCount} 次解锁
              </motion.div>
            )}
          </div>

          <h1 className="text-2xl font-bold text-white mb-2 text-gradient">
            {settings?.displayName || ''}
          </h1>
          <p className="text-white/80 text-sm leading-relaxed mb-6">
            {settings?.bio || ''}
          </p>

          {isLoggedIn && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4"
            >
              <span className="inline-flex items-center gap-2 bg-green-500/20 text-green-300 px-3 py-1 rounded-full text-sm">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                已登录
              </span>
            </motion.div>
          )}

          {/* 社交链接 */}
          <div className="flex justify-center gap-3">
            {socialLinks.map((link, index) => (
              <motion.a
                key={link.name}
                href={(settings as any)?.[link.name.toLowerCase() + 'Url'] || undefined}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ scale: 0, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.3 + index * 0.1, type: 'spring' }}
                whileHover={{ scale: 1.2, rotate: 10, y: -5 }}
                whileTap={{ scale: 0.95 }}
                className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${link.color} flex items-center justify-center text-white shadow-lg hover:shadow-xl transition-all ${
                  !(settings as any)?.[link.name.toLowerCase() + 'Url'] ? 'opacity-30' : ''
                }`}
                title={link.name}
              >
                <span className="text-lg">{link.icon}</span>
              </motion.a>
            ))}
          </div>
        </motion.div>

        {/* 博客目录树 */}
        <BlogFolderTree />
      </div>
    </motion.div>
  )
}
