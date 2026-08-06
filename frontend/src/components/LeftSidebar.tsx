import { motion } from 'framer-motion'
import { useStore } from '../store/useStore'
import { BlogFolderTree } from './BlogFolderTree'

type SocialIconKind = 'github' | 'xiaohongshu' | 'douyin' | 'bilibili'

const socialLinks = [
  { name: 'GitHub', icon: 'github', key: 'githubUrl', color: 'from-gray-400 to-gray-600' },
  { name: '小红书', icon: 'xiaohongshu', key: 'twitterUrl', color: 'from-rose-400 to-red-500' },
  { name: '抖音', icon: 'douyin', key: 'douyinUrl', color: 'from-cyan-400 to-indigo-500' },
  { name: 'Bilibili', icon: 'bilibili', key: 'bilibiliUrl', color: 'from-pink-400 to-rose-400' },
] as const

function SocialIcon({ kind }: { kind: SocialIconKind }) {
  if (kind === 'github') {
    return (
      <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current" aria-hidden="true">
        <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.74.08-.74 1.2.08 1.84 1.23 1.84 1.23 1.07 1.84 2.8 1.31 3.49 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23A11.5 11.5 0 0 1 12 7.08c1.02 0 2.05.14 3.01.42 2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.22v3.28c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z" />
      </svg>
    )
  }

  if (kind === 'xiaohongshu') {
    return (
      <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="6" fill="#e54858" />
        <path d="M7.2 8.2h2.1v7.6H7.2zm4 0h2.1v7.6h-2.1zm-4 3h6.1v1.8H7.2zm9.2-3h1.5a1.8 1.8 0 0 1 1.8 1.8v5.8h-2.1v-5.5h-1.2z" fill="white" />
      </svg>
    )
  }

  if (kind === 'douyin') {
    return (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 4v10.2a4.3 4.3 0 1 1-3.1-4.13" stroke="#25f4ee" transform="translate(-1 0)" />
        <path d="M14 4v10.2a4.3 4.3 0 1 1-3.1-4.13" stroke="#fe2c55" transform="translate(1 0)" />
        <path d="M14 4c.5 2.1 1.8 3.5 4 4" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8.5h16v10H4zM6.5 8.5V6h11v2.5M8 13h.01M16 13h.01M8 16h8" />
    </svg>
  )
}

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
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.08, y: -2 }}
                whileTap={{ scale: 0.96 }}
                transition={{
                  opacity: { delay: 0.3 + index * 0.1, duration: 0.2 },
                  scale: { duration: 0.14, ease: 'easeOut' },
                  y: { duration: 0.14, ease: 'easeOut' },
                }}
                className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${link.color} flex items-center justify-center text-white shadow-lg hover:shadow-xl transition-all ${
                  !href ? 'opacity-30' : ''
                }`}
                title={link.name}
              >
                <SocialIcon kind={link.icon} />
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
