import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Navigate, Route, Routes } from 'react-router-dom'
import { SakuraParticles } from './components/SakuraParticles'
import { Layout } from './components/Layout'
import { LoginModal } from './components/LoginModal'
import { SettingsDrawer } from './components/SettingsDrawer'
import { HomePage } from './pages/HomePage'
import { BlogPage } from './pages/BlogPage'
import { AlbumsPage } from './pages/AlbumsPage'
import { SearchPage } from './pages/SearchPage'
import { useStore } from './store/useStore'

function App() {
  const {
    settings,
    isLoggedIn,
    showLoginModal,
    showSettingsDrawer,
    setShowLoginModal,
    setShowSettingsDrawer,
    fetchSettings,
  } = useStore()

  const sakuraEnabled = settings?.sakuraParticlesEnabled ?? true

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const themeStr = settings?.themeColor || '220,64,90,0.45,24,0'
  const parsed = themeStr.includes('|') ? themeStr.split('|') : themeStr.split(',')
  const h = parsed[0] || '220'
  const s = parsed[1] || '64'
  const l = parsed[2] || '90'
  const a = parsed[3] || '0.45'
  const b = parsed[4] || '24'
  const bgA = parsed[5] || '0'
  const blurVal = parseFloat(b) || 24

  return (
    <>
      <style>{`
        :root {
          --glass-h: ${h};
          --glass-s: ${s}%;
          --glass-l: ${l}%;
          --glass-a: ${a};
          --glass-blur: ${blurVal}px;
          --glass-blur-card: ${blurVal * 0.8}px;
          --glass-blur-light: ${blurVal * 0.5}px;
          --bg-overlay-a: ${bgA};
        }
      `}</style>
      <div className="min-h-screen relative overflow-hidden">
        {/* 背景图 */}
      {settings?.backgroundImageUrl && (
        <>
          <div
            className="fixed inset-0 bg-cover bg-center z-0 transition-opacity duration-1000"
            style={{ backgroundImage: `url(${settings.backgroundImageUrl})` }}
          />
          <div
            className="fixed inset-0 z-0 pointer-events-none transition-opacity duration-300"
            style={{ backgroundColor: 'rgba(0,0,0,var(--bg-overlay-a))' }}
          />
        </>
      )}

      {/* 樱花粒子背景 */}
      <SakuraParticles enabled={sakuraEnabled} />

      {/* 操作按钮 */}
      <div className="fixed top-3 right-3 sm:top-6 sm:right-6 z-50 flex gap-2 sm:gap-3">
        {isLoggedIn && (
          <motion.button
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowSettingsDrawer(true)}
            className="glass-card px-3 sm:px-4 py-2 rounded-full flex items-center gap-2 text-white/80 hover:text-white transition-all"
          >
            <span className="text-xl">⚙️</span>
            <span className="hidden sm:inline text-sm font-medium">设置</span>
          </motion.button>
        )}
        <motion.button
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            if (isLoggedIn) {
              useStore.getState().logout()
            } else {
              setShowLoginModal(true)
            }
          }}
          className="glass-card px-3 sm:px-4 py-2 rounded-full flex items-center gap-2 text-white/80 hover:text-white transition-all"
        >
          <span className="text-xl">{isLoggedIn ? '🚪' : '🌸'}</span>
          <span className="hidden sm:inline text-sm font-medium">{isLoggedIn ? '退出' : sakuraEnabled ? '樱花' : '关闭'}</span>
        </motion.button>
      </div>

      {/* 主内容 */}
      <div className="main-content relative z-10">
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/blog" element={<BlogPage />} />
            <Route path="/albums" element={<AlbumsPage />} />
            <Route path="/search" element={<SearchPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {/* 登录弹窗 */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />

      {/* 设置面板 */}
      <SettingsDrawer
        isOpen={showSettingsDrawer}
        onClose={() => setShowSettingsDrawer(false)}
      />
    </div>
    </>
  )
}

export default App
