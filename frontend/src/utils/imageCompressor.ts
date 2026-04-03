import imageCompression from 'browser-image-compression'

export interface CompressOptions {
  maxSizeMB?: number
  maxWidthOrHeight?: number
  useWebWorker?: boolean
  initialQuality?: number
  maxIteration?: number
}

const defaultOptions: CompressOptions = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  initialQuality: 0.8,
  maxIteration: 5,
}

export async function compressImage(
  file: File,
  options: CompressOptions = defaultOptions
): Promise<File> {
  const mergedOptions = { ...defaultOptions, ...options }

  try {
    const compressionOptions = {
      maxSizeMB: mergedOptions.maxSizeMB,
      maxWidthOrHeight: mergedOptions.maxWidthOrHeight,
      useWebWorker: mergedOptions.useWebWorker,
      initialQuality: mergedOptions.initialQuality,
      maxIteration: mergedOptions.maxIteration,
      fileType: 'image/webp' as const,
      alwaysKeepResolution: false,
      mimeType: 'image/webp',
    }

    console.log(`[ImageCompressor] 原始文件: ${file.name}, 大小: ${(file.size / 1024 / 1024).toFixed(2)}MB, 类型: ${file.type}`)

    const compressedFile = await imageCompression(file, compressionOptions)

    console.log(`[ImageCompressor] 压缩后文件: ${compressedFile.name}, 大小: ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`)

    // 确保返回的文件有正确的名称和类型
    const webpFileName = file.name.replace(/\.[^/.]+$/, '') + '.webp'

    const finalFile = new File([compressedFile], webpFileName, {
      type: 'image/webp',
      lastModified: Date.now(),
    })

    return finalFile
  } catch (error) {
    console.error('[ImageCompressor] 压缩失败:', error)
    throw new Error('图片压缩失败，请重试')
  }
}

// 批量压缩图片
export async function compressImages(
  files: File[],
  options?: CompressOptions
): Promise<File[]> {
  const results = await Promise.allSettled(
    files.map((file) => compressImage(file, options))
  )

  const compressedFiles: File[] = []
  const errors: Error[] = []

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      compressedFiles.push(result.value)
    } else {
      console.error(`图片 ${index} 压缩失败:`, result.reason)
      errors.push(new Error(`图片 ${files[index]?.name || index} 压缩失败`))
    }
  })

  if (errors.length > 0) {
    console.warn(`[ImageCompressor] ${errors.length} 张图片压缩失败`)
  }

  return compressedFiles
}

// 获取图片预览
export function createImagePreview(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 获取图片尺寸
export interface ImageDimensions {
  width: number
  height: number
}

export function getImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const img = new (window as any).Image()
    img.onload = () => {
      resolve({ width: img.width, height: img.height })
      URL.revokeObjectURL(img.src)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

// 验证图片
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  const maxSizeMB = 20
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg']

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: '仅支持 JPG、PNG、GIF、WebP 格式的图片',
    }
  }

  if (file.size > maxSizeMB * 1024 * 1024) {
    return {
      valid: false,
      error: `图片大小不能超过 ${maxSizeMB}MB`,
    }
  }

  return { valid: true }
}
