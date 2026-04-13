import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { SakuraParticles } from './components/SakuraParticles'
import { Layout } from './components/Layout'
import { LoginModal } from './components/LoginModal'
import { SettingsDrawer } from './components/SettingsDrawer'
import { HomePage } from './pages/HomePage'
import { BlogPage } from './pages/BlogPage'
import { PostPage } from './pages/PostPage'
import { AlbumsPage } from './pages/AlbumsPage'
import { SearchPage } from './pages/SearchPage'
import { MePage } from './pages/MePage'
import { ToastCenter } from './components/ToastCenter'
import { showToast } from './lib/toast'
import { useStore } from './store/useStore'

function App() {
  const {
    settings,
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

  useEffect(() => {
    const handleAuthExpired = () => {
      useStore.getState().logout()
      showToast({ type: 'warning', message: '登录已过期，请重新登录' })
    }

    window.addEventListener('auth:expired', handleAuthExpired)
    return () => {
      window.removeEventListener('auth:expired', handleAuthExpired)
    }
  }, [])

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

      {/* 主内容 */}
      <div className="main-content relative z-10">
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/blog" element={<BlogPage />} />
            <Route path="/blog/:articleId" element={<BlogPage />} />
            <Route path="/post/:postId" element={<PostPage />} />
            <Route path="/albums" element={<AlbumsPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/me" element={<MePage />} />
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
      <ToastCenter />
    </div>
    </>
  )
}

export default App
