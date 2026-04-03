import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/useStore'
import { LoadingSpinner } from './LoadingSpinner'
import { compressImage, validateImageFile } from '../utils/imageCompressor'
import { clients } from '../lib/connect'

interface SettingsDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsDrawer({ isOpen, onClose }: SettingsDrawerProps) {
  const { settings, isLoadingSettings, updateSettings } = useStore()
  const [localSettings, setLocalSettings] = useState(settings)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [uploadingImage, setUploadingImage] = useState<'avatar' | 'background' | null>(null)

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings)
    }
  }, [settings])

  const handleImageUpload = async (
    file: File,
    type: 'avatar' | 'background'
  ) => {
    const validation = validateImageFile(file)
    if (!validation.valid) {
      alert(validation.error)
      return
    }

    setUploadingImage(type)
    try {
      const compressedFile = await compressImage(file)

      const uploadResponse = await clients.album.uploadImageRequest({
        albumId: 'default',
        fileName: compressedFile.name,
        mimeType: compressedFile.type,
        fileSize: BigInt(compressedFile.size),
      })

      const formData = new FormData()
      formData.append('file', compressedFile)

      const uploadResult = await fetch(uploadResponse.uploadUrl, {
        method: 'PUT',
        headers: Object.fromEntries(Object.entries(uploadResponse.headers)),
        body: compressedFile,
      })

      if (!uploadResult.ok) {
        throw new Error('Upload failed')
      }

      const confirmResponse = await clients.album.confirmImageUpload({
        imageId: uploadResponse.imageId,
        uploadUrl: uploadResponse.uploadUrl,
      })

      if (confirmResponse.image?.url) {
        const updateKey = type === 'avatar' ? 'avatarUrl' : 'backgroundImageUrl'
        setLocalSettings(prev => ({
          ...prev!,
          [updateKey]: confirmResponse.image!.url!,
        }))
      }
    } catch (error) {
      console.error('Image upload failed:', error)
      alert('图片上传失败，请重试')
    } finally {
      setUploadingImage(null)
    }
  }

  const handleSave = async () => {
    if (!localSettings) return
    setIsSaving(true)
    setSaveError('')

    try {
      await updateSettings(localSettings)
      onClose()
    } catch (error) {
      console.error('Failed to save settings:', error)
      setSaveError('保存失败，请重试')
    } finally {
      setIsSaving(false)
    }
  }

  if (!localSettings) {
    return null
  }

  const themeStr = localSettings.themeColor || '220,64,90,0.45,24,0'
  const parsed = themeStr.includes('|') ? themeStr.split('|') : themeStr.split(',')
  const previewH = parsed[0] || '220'
  const previewS = parsed[1] || '64'
  const previewL = parsed[2] || '90'
  const previewA = parsed[3] || '0.45'
  const previewB = parsed[4] || '24'
  const previewBgA = parsed[5] || '0'
  const previewBlur = parseFloat(previewB) || 24

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <style>{`
            body {
              --glass-h: ${previewH} !important;
              --glass-s: ${previewS}% !important;
              --glass-l: ${previewL}% !important;
              --glass-a: ${previewA} !important;
              --glass-blur: ${previewBlur}px !important;
              --glass-blur-card: ${previewBlur * 0.8}px !important;
              --glass-blur-light: ${previewBlur * 0.5}px !important;
              --bg-overlay-a: ${previewBgA} !important;
            }
          `}</style>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          />

          {/* 抽屉 */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-lg z-50"
          >
            <div className="h-full glass-panel border-l border-white/20 overflow-y-auto">
              {/* 头部 */}
              <div className="sticky top-0 z-10 glass-panel border-b border-white/10 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <span>⚙️</span>
                    <span>设置面板</span>
                  </h2>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-2xl hover:bg-white/10 text-white/60 hover:text-white transition-all"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* 内容 */}
              <div className="p-6 space-y-6">
                {isLoadingSettings ? (
                  <div className="py-12">
                    <LoadingSpinner size="lg" text="加载设置中..." />
                  </div>
                ) : (
                  <>
                    {/* 头像设置 */}
                    <div className="glass-card rounded-3xl p-6">
                      <h3 className="text-white/90 font-semibold mb-4 flex items-center gap-2">
                        <span>👤</span>
                        头像
                      </h3>
                      <div className="flex items-center gap-6">
                        <div className="relative">
                          <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-white/30 flex items-center justify-center bg-gradient-to-br from-blue-300 via-purple-300 to-pink-300">
                            {localSettings.avatarUrl ? (
                              <img
                                src={localSettings.avatarUrl}
                                alt="Avatar"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-4xl">🌸</span>
                            )}
                          </div>
                          {uploadingImage === 'avatar' && (
                            <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                              <LoadingSpinner size="sm" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <input
                            type="file"
                            id="avatar-upload"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) handleImageUpload(file, 'avatar')
                            }}
                          />
                          <label
                            htmlFor="avatar-upload"
                            className="block w-full btn-primary px-4 py-2 rounded-2xl text-white text-center cursor-pointer text-sm"
                          >
                            更换头像
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* 个人信息 */}
                    <div className="glass-card rounded-3xl p-6 space-y-4">
                      <h3 className="text-white/90 font-semibold flex items-center gap-2">
                        <span>📋</span>
                        个人信息
                      </h3>

                      <div>
                        <label className="block text-white/60 text-sm mb-2">显示名称</label>
                        <input
                          type="text"
                          value={localSettings.displayName}
                          onChange={(e) => setLocalSettings({ ...localSettings, displayName: e.target.value })}
                          className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white placeholder-white/40 border border-white/20 focus:border-white/40 focus:outline-none transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-white/60 text-sm mb-2">个人简介</label>
                        <textarea
                          value={localSettings.bio}
                          onChange={(e) => setLocalSettings({ ...localSettings, bio: e.target.value })}
                          rows={3}
                          className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white placeholder-white/40 border border-white/20 focus:border-white/40 focus:outline-none transition-all resize-none"
                        />
                      </div>
                    </div>

                    {/* 社交链接 */}
                    <div className="glass-card rounded-3xl p-6 space-y-4">
                      <h3 className="text-white/90 font-semibold flex items-center gap-2">
                        <span>🔗</span>
                        社交链接
                      </h3>

                      <div>
                        <label className="block text-white/60 text-sm mb-2">Twitter</label>
                        <input
                          type="url"
                          value={localSettings.twitterUrl}
                          onChange={(e) => setLocalSettings({ ...localSettings, twitterUrl: e.target.value })}
                          className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white placeholder-white/40 border border-white/20 focus:border-white/40 focus:outline-none transition-all"
                          placeholder="https://twitter.com/..."
                        />
                      </div>

                      <div>
                        <label className="block text-white/60 text-sm mb-2">GitHub</label>
                        <input
                          type="url"
                          value={localSettings.githubUrl}
                          onChange={(e) => setLocalSettings({ ...localSettings, githubUrl: e.target.value })}
                          className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white placeholder-white/40 border border-white/20 focus:border-white/40 focus:outline-none transition-all"
                          placeholder="https://github.com/..."
                        />
                      </div>

                      <div>
                        <label className="block text-white/60 text-sm mb-2">Bilibili</label>
                        <input
                          type="url"
                          value={localSettings.bilibiliUrl}
                          onChange={(e) => setLocalSettings({ ...localSettings, bilibiliUrl: e.target.value })}
                          className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white placeholder-white/40 border border-white/20 focus:border-white/40 focus:outline-none transition-all"
                          placeholder="https://space.bilibili.com/..."
                        />
                      </div>
                    </div>

                    {/* 外观设置 */}
                    <div className="glass-card rounded-3xl p-6 space-y-4">
                      <h3 className="text-white/90 font-semibold flex items-center gap-2">
                        <span>🎨</span>
                        外观设置
                      </h3>

                      <div>
                        <label className="block text-white/60 text-sm mb-2">背景图片</label>
                        {localSettings.backgroundImageUrl && (
                          <div className="mb-4 h-32 w-full rounded-2xl overflow-hidden relative border border-white/20">
                            <img 
                              src={localSettings.backgroundImageUrl} 
                              alt="Background Preview" 
                              className="w-full h-full object-cover" 
                            />
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                              <span className="text-white text-sm font-medium bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">已选择背景预览</span>
                            </div>
                          </div>
                        )}
                        <input
                          type="file"
                          id="background-upload"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleImageUpload(file, 'background')
                          }}
                        />
                        <label
                          htmlFor="background-upload"
                          className="block w-full btn-primary px-4 py-3 rounded-2xl text-white text-center cursor-pointer relative overflow-hidden"
                        >
                          {uploadingImage === 'background' ? (
                            <LoadingSpinner size="sm" text="上传中..." />
                          ) : (
                            localSettings.backgroundImageUrl ? '更换背景图' : '上传背景图'
                          )}
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 glass-light rounded-2xl">
                        <div>
                          <p className="text-white/90 font-medium">樱花粒子特效</p>
                          <p className="text-white/50 text-sm">启用/禁用背景樱花飘落</p>
                        </div>
                        <button
                          onClick={() => setLocalSettings({
                            ...localSettings,
                            sakuraParticlesEnabled: !localSettings.sakuraParticlesEnabled,
                          })}
                          className={`w-14 h-8 rounded-full transition-all relative ${
                            localSettings.sakuraParticlesEnabled
                              ? 'bg-gradient-to-r from-blue-400 to-pink-400'
                              : 'bg-white/20'
                          }`}
                        >
                          <motion.div
                            animate={{ x: localSettings.sakuraParticlesEnabled ? 28 : 4 }}
                            className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg"
                          />
                        </button>
                      </div>

                      {/* 进阶UI组件外观自定义 */}
                      <div className="glass-light rounded-2xl p-4 space-y-4">
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-white/90 font-medium flex items-center gap-1"><span>🎨</span> UI 玻璃质感自定义</p>
                        </div>
                        
                        {(() => {
                          const themeStr = localSettings.themeColor || '220,64,90,0.45,24,0';
                          const parsed = themeStr.includes('|') ? themeStr.split('|') : themeStr.split(',');
                          const valH = parsed[0] || '220';
                          const valS = parsed[1] || '64';
                          const valL = parsed[2] || '90';
                          const valA = parsed[3] || '0.45';
                          const valB = parsed[4] || '24';
                          const valBgA = parsed[5] || '0';
                          
                          const updateTheme = (h: string, s: string, l: string, a: string, b: string, bgA: string) => {
                            setLocalSettings({ ...localSettings, themeColor: `${h},${s},${l},${a},${b},${bgA}` });
                          };

                          return (
                            <div className="space-y-4">
                              {/* HSL 滑块 - H */}
                              <div className="space-y-2">
                                <div className="flex justify-between text-white/60 text-xs">
                                  <label>色调 (Hue)</label>
                                  <span>{valH}°</span>
                                </div>
                                <input 
                                  type="range" min="0" max="360" step="1"
                                  value={valH}
                                  onChange={(e) => updateTheme(e.target.value, valS, valL, valA, valB, valBgA)}
                                  className="w-full h-2 appearance-none rounded-lg outline-none"
                                  style={{
                                    background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)'
                                  }}
                                />
                              </div>

                              {/* HSL 滑块 - S */}
                              <div className="space-y-2">
                                <div className="flex justify-between text-white/60 text-xs">
                                  <label>饱和度 (Saturation)</label>
                                  <span>{valS}%</span>
                                </div>
                                <input 
                                  type="range" min="0" max="100" step="1"
                                  value={valS}
                                  onChange={(e) => updateTheme(valH, e.target.value, valL, valA, valB, valBgA)}
                                  className="w-full accent-pink-400"
                                />
                              </div>

                              {/* HSL 滑块 - L */}
                              <div className="space-y-2">
                                <div className="flex justify-between text-white/60 text-xs">
                                  <label>明度/纯度 (Lightness)</label>
                                  <span>{valL}%</span>
                                </div>
                                <input 
                                  type="range" min="0" max="100" step="1"
                                  value={valL}
                                  onChange={(e) => updateTheme(valH, valS, e.target.value, valA, valB, valBgA)}
                                  className="w-full accent-pink-400"
                                />
                              </div>

                              {/* 不透明度滑块 */}
                              <div className="space-y-2 pt-2 border-t border-white/10">
                                <div className="flex justify-between text-white/60 text-xs">
                                  <label>玻璃不透明度 (Opacity)</label>
                                  <span>{Math.round(parseFloat(valA) * 100)}%</span>
                                </div>
                                <input 
                                  type="range" min="0" max="1" step="0.05"
                                  value={valA}
                                  onChange={(e) => updateTheme(valH, valS, valL, e.target.value, valB, valBgA)}
                                  className="w-full accent-pink-400"
                                />
                              </div>

                              {/* 模糊程度滑块 */}
                              <div className="space-y-2">
                                <div className="flex justify-between text-white/60 text-xs">
                                  <label>毛玻璃强度 (Blur)</label>
                                  <span>{valB}px</span>
                                </div>
                                <input 
                                  type="range" min="0" max="50" step="1"
                                  value={valB}
                                  onChange={(e) => updateTheme(valH, valS, valL, valA, e.target.value, valBgA)}
                                  className="w-full accent-pink-400"
                                />
                              </div>

                              {/* 背景图不透明度图层滑块 */}
                              <div className="space-y-2 pt-2 border-t border-white/10">
                                <div className="flex justify-between text-white/60 text-xs">
                                  <label>背景变暗图层 (Background Overlay)</label>
                                  <span>{Math.round(parseFloat(valBgA) * 100)}%</span>
                                </div>
                                <input 
                                  type="range" min="0" max="1" step="0.05"
                                  value={valBgA}
                                  onChange={(e) => updateTheme(valH, valS, valL, valA, valB, e.target.value)}
                                  className="w-full accent-pink-400"
                                />
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {saveError && (
                      <div className="text-center text-pink-300 text-sm bg-pink-500/20 px-4 py-2 rounded-2xl">
                        ⚠️ {saveError}
                      </div>
                    )}

                    {/* 保存按钮 */}
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="w-full btn-primary px-6 py-4 rounded-3xl text-white font-semibold text-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSaving ? (
                        <LoadingSpinner size="sm" text="保存中..." />
                      ) : (
                        <>
                          <span>保存设置</span>
                          <span>💾</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
