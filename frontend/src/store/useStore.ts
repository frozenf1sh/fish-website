import { create } from 'zustand'
import { clients, setAuthToken, getAuthToken } from '../lib/connect'

interface Settings {
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

export const useStore = create<AppState>((set, get) => ({
  // 认证状态
  isLoggedIn: !!getAuthToken(),
  token: getAuthToken(),

  login: async (username: string, password: string) => {
    const response: any = await clients.auth.login({ username, password })
    const token = response.token
    setAuthToken(token)
    set({ isLoggedIn: true, token, showLoginModal: false })
  },

  logout: () => {
    setAuthToken(null)
    set({ isLoggedIn: false, token: null, settings: null })
  },

  checkAuth: () => {
    const token = getAuthToken()
    const isLoggedIn = !!token
    if (isLoggedIn !== get().isLoggedIn) {
      set({ isLoggedIn, token })
    }
    return isLoggedIn
  },

  // 设置
  settings: null,
  isLoadingSettings: false,
  settingsError: null,

  fetchSettings: async () => {
    set({ isLoadingSettings: true, settingsError: null })
    try {
      const response: any = await clients.settings.getSettings()
      if (response.settings) {
        set({ settings: response.settings })
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error)
      set({ settingsError: '加载设置失败', settings: defaultSettings })
    } finally {
      set({ isLoadingSettings: false })
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
}))
