import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'

export function MePage() {
  const navigate = useNavigate()
  const { settings, isLoggedIn, setShowLoginModal, setShowSettingsDrawer, logout } = useStore()

  const displayName = settings?.displayName || (isLoggedIn ? '已登录用户' : '访客')
  const bio = settings?.bio || '欢迎来到个人中心，这里将持续扩展更多能力。'
  const avatarUrl = settings?.avatarUrl

  return (
    <div className="space-y-4 p-4 sm:p-6 pb-24 xl:pb-6">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-3xl p-5"
      >
        <div className="flex items-start gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="avatar"
              className="w-16 h-16 rounded-full object-cover border border-white/25"
            />
          ) : (
            <div className="w-16 h-16 rounded-full border border-white/25 bg-white/10 flex items-center justify-center text-2xl">
              🐟
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-white truncate">{displayName}</h2>
            <p className="text-white/70 text-sm mt-1 leading-6">{bio}</p>
            <p className="text-white/50 text-xs mt-2">{isLoggedIn ? '状态：已登录' : '状态：未登录'}</p>
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass-card rounded-3xl p-4"
      >
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-3">账号</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              if (isLoggedIn) {
                logout()
                return
              }
              setShowLoginModal(true)
            }}
            className="px-3 py-2.5 rounded-xl border border-white/25 text-white text-sm bg-white/10 hover:bg-white/20"
          >
            {isLoggedIn ? '退出登录' : '登录'}
          </button>
          <button
            type="button"
            disabled={!isLoggedIn}
            onClick={() => setShowSettingsDrawer(true)}
            className="px-3 py-2.5 rounded-xl border border-white/25 text-white text-sm bg-white/10 hover:bg-white/20 disabled:opacity-45 disabled:cursor-not-allowed"
          >
            设置
          </button>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card rounded-3xl p-4"
      >
        <h3 className="text-sm uppercase tracking-wide text-white/60 mb-3">更多</h3>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => navigate('/projects')} className="rounded-2xl border border-white/15 bg-white/5 p-4 text-left text-white hover:bg-white/10"><span className="text-2xl">💻</span><span className="mt-2 block text-sm font-medium">项目</span><span className="mt-1 block text-xs text-white/50">正在做什么</span></button>
          <button type="button" onClick={() => navigate('/about')} className="rounded-2xl border border-white/15 bg-white/5 p-4 text-left text-white hover:bg-white/10"><span className="text-2xl">🌟</span><span className="mt-2 block text-sm font-medium">关于</span><span className="mt-1 block text-xs text-white/50">认识一下我</span></button>
        </div>
      </motion.section>
    </div>
  )
}
