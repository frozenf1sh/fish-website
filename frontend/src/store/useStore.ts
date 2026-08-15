import { create } from 'zustand'
import {
  clients,
  getAccessTokenExpiresAt,
  getAuthToken,
  isAccessTokenExpiring,
  refreshAccessToken,
  setAuthToken,
} from '../lib/connect'

export interface Settings {
  displayName: string
  bio: string
  avatarUrl: string
  twitterUrl: string
  githubUrl: string
  bilibiliUrl: string
  customLinks: string
  backgroundImageUrl: string
  sakuraParticlesEnabled: boolean
  themeColor: string
}

interface AppState {
  // 认证状态
  isLoggedIn: boolean
  token: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  checkAuth: () => boolean
  initializeSession: () => void
  handleAuthExpired: () => void

  // 设置
  settings: Settings | null
  isLoadingSettings: boolean
  settingsError: string | null
  fetchSettings: () => Promise<void>
  updateSettings: (settings: Partial<Settings>) => Promise<void>

  // UI 状态
  showLoginModal: boolean
  setShowLoginModal: (show: boolean) => void
  showSettingsDrawer: boolean
  setShowSettingsDrawer: (show: boolean) => void

  // 头像点击计数（用于隐藏登录入口）
  avatarClickCount: number
  incrementAvatarClickCount: () => void
  resetAvatarClickCount: () => void
}

const defaultSettings: Settings = {
  displayName: '',
  bio: '',
  avatarUrl: '',
  twitterUrl: '',
  githubUrl: '',
  bilibiliUrl: '',
  customLinks: '',
  backgroundImageUrl: '',
  sakuraParticlesEnabled: true,
  themeColor: '',
}

let authRefreshTimer: ReturnType<typeof setTimeout> | undefined
let settingsRequestPromise: Promise<void> | null = null

export const useStore = create<AppState>((set, get) => {
  const clearAccessTokenRefresh = () => {
    if (authRefreshTimer !== undefined) {
      clearTimeout(authRefreshTimer)
      authRefreshTimer = undefined
    }
  }

  const scheduleAccessTokenRefresh = (token: string) => {
    clearAccessTokenRefresh()
    const expiresAt = getAccessTokenExpiresAt(token)
    if (expiresAt === null) {
      void refreshAccessToken()
      return
    }

    const delay = Math.max(1000, expiresAt - Date.now() - 60 * 1000)
    authRefreshTimer = setTimeout(async () => {
      const currentToken = getAuthToken()
      if (!currentToken || currentToken !== token) return

      const refreshedToken = await refreshAccessToken()
      if (refreshedToken) {
        set({ isLoggedIn: true, token: refreshedToken })
        scheduleAccessTokenRefresh(refreshedToken)
      } else if (getAuthToken() === token) {
        // Keep the session during transient network failures and retry later.
        authRefreshTimer = setTimeout(() => scheduleAccessTokenRefresh(token), 15 * 1000)
      }
    }, delay)
  }

  return {
  // 认证状态
  isLoggedIn: !!getAuthToken(),
  token: getAuthToken(),

  login: async (username: string, password: string) => {
    const response = await clients.auth.login({ username, password })
    const token = response.token
    setAuthToken(token)
    set({ isLoggedIn: true, token, showLoginModal: false })
    scheduleAccessTokenRefresh(token)
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  },

  logout: () => {
    void clients.auth.logout().catch((error) => {
      console.warn('Failed to clear refresh session:', error)
    })
    setAuthToken(null)
    clearAccessTokenRefresh()
    set({ isLoggedIn: false, token: null, settings: null })
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  },

  checkAuth: () => {
    const token = getAuthToken()
    const isLoggedIn = !!token && !isAccessTokenExpiring(token)
    if (isLoggedIn !== get().isLoggedIn) {
      set({ isLoggedIn, token })
    }
    if (token) scheduleAccessTokenRefresh(token)
    return isLoggedIn
  },

  initializeSession: () => {
    const token = getAuthToken()
    if (!token) {
      clearAccessTokenRefresh()
      set({ isLoggedIn: false, token: null })
      return
    }

    set({ isLoggedIn: true, token })
    scheduleAccessTokenRefresh(token)
  },

  handleAuthExpired: () => {
    clearAccessTokenRefresh()
    setAuthToken(null)
    set({ isLoggedIn: false, token: null, settings: null, showLoginModal: true })
  },

  // 设置
  settings: null,
  isLoadingSettings: false,
  settingsError: null,

  fetchSettings: async () => {
    if (settingsRequestPromise) {
      return settingsRequestPromise
    }

    const request = (async () => {
      set({ isLoadingSettings: true, settingsError: null })
      try {
        const response = await clients.settings.getSettings()
        if (response.settings) {
          set({ settings: response.settings })
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error)
        set({ settingsError: '加载设置失败', settings: defaultSettings })
      } finally {
        set({ isLoadingSettings: false })
      }
    })()

    settingsRequestPromise = request
    try {
      await request
    } finally {
      if (settingsRequestPromise === request) {
        settingsRequestPromise = null
      }
    }
  },

  updateSettings: async (partialSettings: Partial<Settings>) => {
    const current = get().settings || defaultSettings
    const newSettings = { ...current, ...partialSettings }

    const updateMask = Object.keys(partialSettings)

    await clients.settings.updateSettings({
      settings: newSettings,
      updateMask,
    })

    set({ settings: newSettings })
  },

  // UI 状态
  showLoginModal: false,
  setShowLoginModal: (show: boolean) => set({ showLoginModal: show, avatarClickCount: 0 }),

  showSettingsDrawer: false,
  setShowSettingsDrawer: (show: boolean) => set({ showSettingsDrawer: show }),

  // 头像点击计数
  avatarClickCount: 0,
  incrementAvatarClickCount: () => {
    const newCount = get().avatarClickCount + 1
    set({ avatarClickCount: newCount })
    if (newCount >= 5 && !get().isLoggedIn) {
      set({ showLoginModal: true, avatarClickCount: 0 })
    }
  },
  resetAvatarClickCount: () => set({ avatarClickCount: 0 }),
  }
})
