import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { ToastCenter } from './components/ToastCenter'
import { LoadingSpinner } from './components/LoadingSpinner'
import { ErrorBoundary } from './components/ErrorBoundary'
import { showToast } from './lib/toast'
import { useStore } from './store/useStore'
import { readSiteBehaviorConfig } from './utils/siteConfig'

// Keep the initial route small. Rich editing and media screens are loaded only when visited.
const BlogPage = lazy(() => import('./pages/BlogPage').then(({ BlogPage }) => ({ default: BlogPage })))
const PostPage = lazy(() => import('./pages/PostPage').then(({ PostPage }) => ({ default: PostPage })))
const AlbumsPage = lazy(() => import('./pages/AlbumsPage').then(({ AlbumsPage }) => ({ default: AlbumsPage })))
const SearchPage = lazy(() => import('./pages/SearchPage').then(({ SearchPage }) => ({ default: SearchPage })))
const MePage = lazy(() => import('./pages/MePage').then(({ MePage }) => ({ default: MePage })))
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const ContentManagerPage = lazy(() => import('./pages/ContentManagerPage'))
const SakuraParticles = lazy(() => import('./components/SakuraParticles').then(({ SakuraParticles }) => ({ default: SakuraParticles })))
const LoginModal = lazy(() => import('./components/LoginModal').then(({ LoginModal }) => ({ default: LoginModal })))
const SettingsDrawer = lazy(() => import('./components/SettingsDrawer').then(({ SettingsDrawer }) => ({ default: SettingsDrawer })))

function App() {
  const location = useLocation()
  const {
    settings,
    showLoginModal,
    showSettingsDrawer,
    setShowLoginModal,
    setShowSettingsDrawer,
    fetchSettings,
  } = useStore()

  const sakuraEnabled = settings?.sakuraParticlesEnabled ?? true
  const siteBehavior = readSiteBehaviorConfig(settings?.customLinks)
  const baseTextMode = siteBehavior.baseTextMode
  const isBlogArticleRoute = /^\/blog\//.test(location.pathname)

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

  useEffect(() => {
    const config = readSiteBehaviorConfig(settings?.customLinks)
    const { defaultTitle, hiddenTitle, focusTitle } = config
    let focusTimer: number | undefined

    const applyTitleByVisibility = () => {
      if (focusTimer) {
        window.clearTimeout(focusTimer)
        focusTimer = undefined
      }

      if (document.hidden) {
        document.title = hiddenTitle
        return
      }

      if (focusTitle) {
        document.title = focusTitle
        focusTimer = window.setTimeout(() => {
          document.title = defaultTitle
        }, 1200)
      } else {
        document.title = defaultTitle
      }
    }

    applyTitleByVisibility()
    document.addEventListener('visibilitychange', applyTitleByVisibility)

    return () => {
      if (focusTimer) {
        window.clearTimeout(focusTimer)
      }
      document.removeEventListener('visibilitychange', applyTitleByVisibility)
    }
  }, [settings?.customLinks])

  useEffect(() => {
    const config = readSiteBehaviorConfig(settings?.customLinks)
    const iconHref = config.faviconUrl || '/favicon.ico'
    let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.type = 'image/png'
    link.href = iconHref
  }, [settings?.customLinks])

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
          --site-base-text-color: ${baseTextMode === 'black' ? '#111827' : '#f8fafc'};
        }

        .site-base-text .main-content {
          color: var(--site-base-text-color);
        }

        .site-base-text-black .main-content [class*="text-white"] {
          color: #111827 !important;
        }

        .site-base-text-black .main-content [class*="placeholder-white"]::placeholder,
        .site-base-text-black .main-content [class*="placeholder:text-white"]::placeholder {
          color: rgba(17, 24, 39, 0.5) !important;
        }
      `}</style>
      <div className={`min-h-screen relative overflow-hidden ${isBlogArticleRoute ? '' : (baseTextMode === 'black' ? 'site-base-text site-base-text-black' : 'site-base-text')}`}>
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
      {sakuraEnabled && (
        <Suspense fallback={null}>
          <SakuraParticles />
        </Suspense>
      )}

      {/* 主内容 */}
      <div className="main-content relative z-10">
        <ErrorBoundary>
          <Suspense fallback={<div className="min-h-[50vh] flex items-center justify-center"><LoadingSpinner text="正在打开页面…" /></div>}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/blog" element={<BlogPage />} />
                <Route path="/blog/:articleId" element={<BlogPage />} />
                <Route path="/post/:postId" element={<PostPage />} />
                <Route path="/albums" element={<AlbumsPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/me" element={<MePage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/manage/content" element={<ContentManagerPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>

      {/* 登录弹窗 */}
      {(showLoginModal || showSettingsDrawer) && (
        <Suspense fallback={null}>
          {showLoginModal && (
            <LoginModal
              isOpen
              onClose={() => setShowLoginModal(false)}
            />
          )}

          {/* 设置面板 */}
          {showSettingsDrawer && (
            <SettingsDrawer
              isOpen
              onClose={() => setShowSettingsDrawer(false)}
            />
          )}
        </Suspense>
      )}
      <ToastCenter />
    </div>
    </>
  )
}

export default App
