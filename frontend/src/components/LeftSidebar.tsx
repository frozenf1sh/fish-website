import { motion } from 'framer-motion'
import { useStore } from '../store/useStore'
import { BlogFolderTree } from './BlogFolderTree'

const socialLinks = [
  { name: 'GitHub', icon: '🐱', key: 'githubUrl', color: 'from-gray-400 to-gray-600' },
  { name: '小红书', icon: '📕', key: 'twitterUrl', color: 'from-rose-400 to-red-500' },
  { name: '抖音', icon: '🎵', key: 'douyinUrl', color: 'from-cyan-400 to-indigo-500' },
  { name: 'Bilibili', icon: '📺', key: 'bilibiliUrl', color: 'from-pink-400 to-rose-400' },
] as const

export function LeftSidebar() {
  const {
    settings,
    isLoggedIn,
    setShowSettingsDrawer,
    setShowLoginModal,
    logout,
  } = useStore()

  let customLinks: Record<string, string> = {}
  try {
    customLinks = settings?.customLinks ? JSON.parse(settings.customLinks) : {}
  } catch {
    customLinks = {}
  }

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
              onClick={() => {
                if (!isLoggedIn) {
                  setShowLoginModal(true)
                }
              }}
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
                  <span className="text-5xl">🐟</span>
                </div>
              )}
            </button>
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
              (() => {
                const href = link.key === 'douyinUrl' ? (customLinks.douyinUrl || '') : (settings?.[link.key] || '')
                return (
              <motion.a
                key={link.name}
                href={href || undefined}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ scale: 0, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.3 + index * 0.1, type: 'spring' }}
                whileHover={{ scale: 1.2, rotate: 10, y: -5 }}
                whileTap={{ scale: 0.95 }}
                className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${link.color} flex items-center justify-center text-white shadow-lg hover:shadow-xl transition-all ${
                  !href ? 'opacity-30' : ''
                }`}
                title={link.name}
              >
                <span className="text-lg">{link.icon}</span>
              </motion.a>
                )
              })()
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-white/15 flex gap-2">
            {isLoggedIn && (
              <button
                onClick={() => setShowSettingsDrawer(true)}
                className="flex-1 px-3 py-2 rounded-2xl bg-white/15 text-white/90 hover:bg-white/25 transition-all"
              >
                ⚙️ 设置
              </button>
            )}
            <button
              onClick={() => {
                if (isLoggedIn) {
                  logout()
                } else {
                  setShowLoginModal(true)
                }
              }}
              className="flex-1 px-3 py-2 rounded-2xl bg-white/10 text-white/85 hover:bg-white/20 transition-all"
            >
              {isLoggedIn ? '🚪 退出' : '🔐 登录'}
            </button>
          </div>
        </motion.div>

        {/* 博客目录树 */}
        <BlogFolderTree />
      </div>
    </motion.div>
  )
}
