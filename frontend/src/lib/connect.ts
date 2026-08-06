import { createPromiseClient } from '@connectrpc/connect'
import { Code, ConnectError } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import {
  AuthService,
  PostService,
  BlogService,
  AlbumService,
  SettingsService,
} from '../gen/home/v1/homepage_connect'

const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8080'
    }
  }
  return '/api'
}

const transport = createConnectTransport({
  baseUrl: getApiBaseUrl(),
  credentials: 'include',
  interceptors: [
    (next) => async (req) => {
      const token = getAuthToken()
      if (token) {
        req.header.set('Authorization', `Bearer ${token}`)
      }
      try {
        return await next(req)
      } catch (err) {
        const connectErr = ConnectError.from(err)
        if (connectErr.code === Code.Unauthenticated && !req.url.endsWith('/Refresh')) {
          const refreshed = await refreshAccessToken()
          if (refreshed) {
            req.header.set('Authorization', `Bearer ${refreshed}`)
            return next(req)
          }
        }
        throw err
      }
    },
  ],
})

export function setAuthToken(token: string | null) {
  if (token) {
    try {
      localStorage.setItem('auth_token', token)
    } catch (e) {
      console.warn('Failed to save token to localStorage:', e)
    }
  } else {
    try {
      localStorage.removeItem('auth_token')
    } catch (e) {
      console.warn('Failed to remove token from localStorage:', e)
    }
  }
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem('auth_token')
  } catch (e) {
    console.warn('Failed to read token from localStorage:', e)
    return null
  }
}

const authClient = createPromiseClient(AuthService, transport)
const postClient = createPromiseClient(PostService, transport)
const blogClient = createPromiseClient(BlogService, transport)
const albumClient = createPromiseClient(AlbumService, transport)
const settingsClient = createPromiseClient(SettingsService, transport)

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = authClient.refresh({}).then((response) => {
    setAuthToken(response.token)
    return response.token
  }).catch(() => {
    setAuthToken(null)
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('auth:expired'))
    return null
  }).finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

type ArticleStatus = 'draft' | 'published'
type PageInput = { pageSize?: number; pageToken?: string }
type LoginInput = { username: string; password: string }
type CreatePostInput = { content: string; imageIds?: string[] }
type PostIDInput = { id: string }
type UpdatePostInput = { id: string; content: string; imageUrls?: string[] }
type CreateArticleInput = { title: string; content: string; folderId?: string; tags?: string[]; status: ArticleStatus }
type UpdateArticleInput = CreateArticleInput & { articleId: string }
type ArticleIDInput = { articleId: string }
type ListArticleInput = PageInput & { folderId?: string; tag?: string; status?: ArticleStatus }
type FolderInput = { name: string; parentFolderId?: string }
type UpdateFolderInput = FolderInput & { folderId: string }
type FolderIDInput = { folderId: string }
type CreateAlbumInput = { name: string; description?: string; isPublic?: boolean }
type ListAlbumInput = PageInput & { onlyPublic?: boolean }
type AlbumIDInput = { albumId: string }
type UploadImageInput = { albumId?: string; fileName: string; mimeType: string; fileSize: number | bigint | string }
type ConfirmImageInput = { imageId: string; uploadUrl: string }
type UpdateAlbumInput = CreateAlbumInput & { albumId: string }
type MoveImagesInput = { fromAlbumId: string; targetAlbumId: string; imageIds?: string[] }
type DeleteImagesInput = { albumId: string; imageIds?: string[] }
type SiteSettingsInput = {
  displayName?: string
  bio?: string
  avatarUrl?: string
  twitterUrl?: string
  githubUrl?: string
  bilibiliUrl?: string
  customLinks?: string
  backgroundImageUrl?: string
  sakuraParticlesEnabled?: boolean
  themeColor?: string
}
type UpdateSettingsInput = { settings?: SiteSettingsInput; updateMask?: string[] }

export const clients = {
  auth: {
    login: async (req: LoginInput) => {
      const response = await authClient.login(req)
      return {
        token: response.token,
        expiresAt: {
          toDate: () => response.expiresAt?.toDate() || new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      }
    },
    refresh: async () => {
      const response = await authClient.refresh({})
      return { token: response.token, expiresAt: response.expiresAt }
    },
    logout: async () => {
      await authClient.logout({})
    },
  },
  post: {
    createPost: async (req: CreatePostInput) => {
      const response = await postClient.createPost(req)
      return { post: response.post ? { id: response.post.id } : { id: 'new-post' } }
    },
    listPosts: async (req: PageInput = {}) => {
      const response = await postClient.listPosts({
        pageSize: req.pageSize ?? 50,
        pageToken: req.pageToken ?? '',
      })
      return {
        posts: response.posts.map((p) => ({
          id: p.id,
          content: p.content,
          imageUrls: p.imageUrls,
          createdAt: { toDate: () => p.createdAt?.toDate() || new Date() },
          updatedAt: { toDate: () => p.updatedAt?.toDate() || p.createdAt?.toDate() || new Date() },
        })),
        nextPageToken: response.nextPageToken,
        hasMore: response.hasMore,
      }
    },
    getPost: async (req: PostIDInput) => {
      const response = await postClient.getPost({ id: req.id })
      return {
        post: response.post
          ? {
              id: response.post.id,
              content: response.post.content,
              imageUrls: response.post.imageUrls,
              createdAt: { toDate: () => response.post?.createdAt?.toDate() || new Date() },
              updatedAt: { toDate: () => response.post?.updatedAt?.toDate() || response.post?.createdAt?.toDate() || new Date() },
            }
          : null,
      }
    },
    updatePost: async (req: UpdatePostInput) => {
      const response = await postClient.updatePost({
        id: req.id,
        content: req.content,
        imageUrls: req.imageUrls || [],
      })
      return {
        post: response.post
          ? {
              id: response.post.id,
              content: response.post.content,
              imageUrls: response.post.imageUrls,
              createdAt: { toDate: () => response.post?.createdAt?.toDate() || new Date() },
              updatedAt: { toDate: () => response.post?.updatedAt?.toDate() || response.post?.createdAt?.toDate() || new Date() },
            }
          : null,
      }
    },
    deletePost: async (req: PostIDInput) => {
      await postClient.deletePost(req)
      return {}
    },
  },
  blog: {
    createArticle: async (req: CreateArticleInput) => {
      const response = await blogClient.createArticle({
        title: req.title,
        content: req.content,
        folderId: req.folderId || '',
        tags: req.tags || [],
        status: req.status === 'draft' ? 1 : 2,
      })

      return {
        article: response.article
          ? {
              id: response.article.id,
              title: response.article.title,
              content: response.article.content,
              folderId: response.article.folderId,
              tags: response.article.tags,
              status: response.article.status === 1 ? 'draft' : 'published',
              createdAt: { toDate: () => response.article?.createdAt?.toDate() || new Date() },
              updatedAt: { toDate: () => response.article?.updatedAt?.toDate() || new Date() },
            }
          : null,
      }
    },
    updateArticle: async (req: UpdateArticleInput) => {
      const response = await blogClient.updateArticle({
        articleId: req.articleId,
        title: req.title,
        content: req.content,
        folderId: req.folderId || '',
        tags: req.tags || [],
        status: req.status === 'draft' ? 1 : 2,
      })
      return {
        article: response.article
          ? {
              id: response.article.id,
              title: response.article.title,
              content: response.article.content,
              folderId: response.article.folderId,
              tags: response.article.tags,
              status: response.article.status === 1 ? 'draft' : 'published',
              createdAt: { toDate: () => response.article?.createdAt?.toDate() || new Date() },
              updatedAt: { toDate: () => response.article?.updatedAt?.toDate() || new Date() },
            }
          : null,
      }
    },
    deleteArticle: async (req: ArticleIDInput) => {
      await blogClient.deleteArticle({ articleId: req.articleId })
      return {}
    },
    listArticles: async (req: ListArticleInput = {}) => {
      const response = await blogClient.listArticles({
        pageSize: req.pageSize ?? 50,
        pageToken: req.pageToken ?? '',
        folderId: req.folderId ?? '',
        tag: req.tag ?? '',
        status: req.status === 'draft' ? 1 : req.status === 'published' ? 2 : 0,
      })
      return {
        articles: (response.articles || []).map((article) => ({
          id: article.id,
          title: article.title,
          content: article.content,
          folderId: article.folderId,
          tags: article.tags,
          status: article.status === 1 ? 'draft' : 'published',
          createdAt: { toDate: () => article.createdAt?.toDate() || new Date() },
          updatedAt: { toDate: () => article.updatedAt?.toDate() || new Date() },
        })),
        nextPageToken: response.nextPageToken || '',
        hasMore: response.hasMore || false,
        folders: response.folders || [],
      }
    },
    getArticle: async (req: ArticleIDInput) => {
      const response = await blogClient.getArticle({ articleId: req.articleId })
      return {
        article: response.article
          ? {
              id: response.article.id,
              title: response.article.title,
              content: response.article.content,
              folderId: response.article.folderId,
              tags: response.article.tags,
              status: response.article.status === 1 ? 'draft' : 'published',
              createdAt: { toDate: () => response.article?.createdAt?.toDate() || new Date() },
              updatedAt: { toDate: () => response.article?.updatedAt?.toDate() || new Date() },
            }
          : null,
      }
    },
    createFolder: async (req: FolderInput) => {
      const response = await blogClient.createFolder({
        name: req.name,
        parentFolderId: req.parentFolderId || '',
      })
      return {
        folder: response.folder
          ? {
              id: response.folder.id,
              name: response.folder.name,
              parentFolderId: response.folder.parentFolderId,
              children: response.folder.children || [],
            }
          : null,
      }
    },
    updateFolder: async (req: UpdateFolderInput) => {
      const response = await blogClient.updateFolder({
        folderId: req.folderId,
        name: req.name,
        parentFolderId: req.parentFolderId || '',
      })
      return {
        folder: response.folder
          ? {
              id: response.folder.id,
              name: response.folder.name,
              parentFolderId: response.folder.parentFolderId,
              children: response.folder.children || [],
            }
          : null,
      }
    },
    deleteFolder: async (req: FolderIDInput) => {
      await blogClient.deleteFolder({
        folderId: req.folderId,
      })
      return {}
    },
  },
  album: {
    createAlbum: async (req: CreateAlbumInput) => {
      const response = await albumClient.createAlbum({
        name: req.name,
        description: req.description || '',
        isPublic: !!req.isPublic,
      })
      return {
        album: response.album
          ? {
              id: response.album.id,
              name: response.album.name,
              description: response.album.description,
              isPublic: response.album.isPublic,
              createdAt: {
                toDate: () => response.album?.createdAt?.toDate() || new Date(),
              },
            }
          : null,
      }
    },
    listAlbums: async (req: ListAlbumInput = {}) => {
      const response = await albumClient.listAlbums({
        pageSize: req.pageSize ?? 50,
        pageToken: req.pageToken ?? '',
        onlyPublic: !!req.onlyPublic,
      })
      return {
        albums: (response.albums || []).map((album) => ({
          id: album.id,
          name: album.name,
          description: album.description,
          isPublic: album.isPublic,
          createdAt: { toDate: () => album.createdAt?.toDate() || new Date() },
        })),
        nextPageToken: response.nextPageToken || '',
        hasMore: !!response.hasMore,
      }
    },
    getAlbum: async (req: AlbumIDInput) => {
      const response = await albumClient.getAlbum({ albumId: req.albumId })
      return {
        album: response.album
          ? {
              id: response.album.id,
              name: response.album.name,
              description: response.album.description,
              isPublic: response.album.isPublic,
              createdAt: { toDate: () => response.album?.createdAt?.toDate() || new Date() },
            }
          : null,
        images: (response.images || []).map((image) => ({
          id: image.id,
          albumId: image.albumId,
          url: image.url,
          thumbnailUrl: image.thumbnailUrl,
          fileName: image.fileName,
          fileSize: Number(image.fileSize || 0),
          mimeType: image.mimeType,
          createdAt: { toDate: () => image.createdAt?.toDate() || new Date() },
        })),
      }
    },
    uploadImageRequest: async (req: UploadImageInput) => {
      const response = await albumClient.uploadImageRequest({
        albumId: req.albumId || '',
        fileName: req.fileName,
        mimeType: req.mimeType,
        fileSize: BigInt(req.fileSize.toString()),
      })
      return {
        uploadUrl: response.uploadUrl,
        imageId: response.imageId,
        headers: response.headers,
        expiresAt: {
          toDate: () => response.expiresAt?.toDate() || new Date(Date.now() + 3600 * 1000),
        },
      }
    },
    confirmImageUpload: async (req: ConfirmImageInput) => {
      const response = await albumClient.confirmImageUpload(req)
      return {
        image: response.image
          ? {
              id: response.image.id,
              albumId: response.image.albumId,
              url: response.image.url,
              thumbnailUrl: response.image.thumbnailUrl,
              fileName: response.image.fileName,
              fileSize: Number(response.image.fileSize || 0),
              mimeType: response.image.mimeType,
              createdAt: { toDate: () => response.image?.createdAt?.toDate() || new Date() },
            }
          : null,
      }
    },
    updateAlbum: async (req: UpdateAlbumInput) => {
      const response = await albumClient.updateAlbum({
        albumId: req.albumId,
        name: req.name,
        description: req.description || '',
        isPublic: !!req.isPublic,
      })
      return {
        album: response.album
          ? {
              id: response.album.id,
              name: response.album.name,
              description: response.album.description,
              isPublic: response.album.isPublic,
              createdAt: { toDate: () => response.album?.createdAt?.toDate() || new Date() },
            }
          : null,
      }
    },
    moveImages: async (req: MoveImagesInput) => {
      const response = await albumClient.moveImages({
        fromAlbumId: req.fromAlbumId,
        targetAlbumId: req.targetAlbumId,
        imageIds: req.imageIds || [],
      })
      return {
        movedCount: Number(response.movedCount || 0),
      }
    },
    analyzeImageReferences: async (req: AlbumIDInput) => {
      const response = await albumClient.analyzeImageReferences({
        albumId: req.albumId,
      })
      return {
        references: (response.references || []).map((r) => ({
          imageId: r.imageId,
          url: r.url,
          fileName: r.fileName,
          referenceCount: Number(r.referenceCount || 0),
          postReferenceCount: Number(r.postReferenceCount || 0),
          blogReferenceCount: Number(r.blogReferenceCount || 0),
          avatarReferenceCount: Number(r.avatarReferenceCount || 0),
          backgroundReferenceCount: Number(r.backgroundReferenceCount || 0),
          faviconReferenceCount: Number(r.faviconReferenceCount || 0),
          safeToDelete: !!r.safeToDelete,
        })),
        totalImages: Number(response.totalImages || 0),
        deletableImages: Number(response.deletableImages || 0),
        referencedImages: Number(response.referencedImages || 0),
        totalReferenceCount: Number(response.totalReferenceCount || 0),
      }
    },
    repairImageReferences: async () => {
      const response = await albumClient.repairImageReferences({})
      return {
        processedImages: Number(response.processedImages || 0),
        referencedImages: Number(response.referencedImages || 0),
        totalReferenceCount: Number(response.totalReferenceCount || 0),
        repairedAt: { toDate: () => response.repairedAt?.toDate() || new Date() },
      }
    },
    deleteImages: async (req: DeleteImagesInput) => {
      const response = await albumClient.deleteImages({
        albumId: req.albumId,
        imageIds: req.imageIds || [],
      })
      return {
        deletedCount: Number(response.deletedCount || 0),
        scheduledDeleteAt: {
          toDate: () => response.scheduledDeleteAt?.toDate() || new Date(),
        },
      }
    },
    deleteAlbum: async (req: AlbumIDInput) => {
      await albumClient.deleteAlbum({ albumId: req.albumId })
      return {}
    },
  },
  settings: {
    getSettings: async () => {
      const response = await settingsClient.getSettings({})
      const settings = response.settings
      return {
        settings: settings
          ? {
              displayName: settings.displayName,
              bio: settings.bio,
              avatarUrl: settings.avatarUrl,
              twitterUrl: settings.twitterUrl,
              githubUrl: settings.githubUrl,
              bilibiliUrl: settings.bilibiliUrl,
              customLinks: settings.customLinks,
              backgroundImageUrl: settings.backgroundImageUrl,
              sakuraParticlesEnabled: settings.sakuraParticlesEnabled,
              themeColor: settings.themeColor,
              updatedAt: { toDate: () => settings.updatedAt?.toDate() || new Date() },
            }
          : null,
      }
    },
    updateSettings: async (req: UpdateSettingsInput) => {
      // 提取安全的字段，排除可能导致反序列化崩溃的自定义包装对象如 updatedAt
      const safeSettings = {
        displayName: req.settings?.displayName || '',
        bio: req.settings?.bio || '',
        avatarUrl: req.settings?.avatarUrl || '',
        twitterUrl: req.settings?.twitterUrl || '',
        githubUrl: req.settings?.githubUrl || '',
        bilibiliUrl: req.settings?.bilibiliUrl || '',
        customLinks: req.settings?.customLinks || '',
        backgroundImageUrl: req.settings?.backgroundImageUrl || '',
        sakuraParticlesEnabled: req.settings?.sakuraParticlesEnabled || false,
        themeColor: req.settings?.themeColor || '',
      };
      
      const cleanUpdateMask = req.updateMask?.filter(
        (key: string) => key !== 'updatedAt'
      ) || [];

      const response = await settingsClient.updateSettings({
        settings: safeSettings,
        updateMask: cleanUpdateMask,
      });
      return {
        settings: {
          displayName: response.settings?.displayName || '',
          bio: response.settings?.bio || '',
          avatarUrl: response.settings?.avatarUrl || '',
          twitterUrl: response.settings?.twitterUrl || '',
          githubUrl: response.settings?.githubUrl || '',
          bilibiliUrl: response.settings?.bilibiliUrl || '',
          customLinks: response.settings?.customLinks || '',
          backgroundImageUrl: response.settings?.backgroundImageUrl || '',
          sakuraParticlesEnabled: response.settings?.sakuraParticlesEnabled || false,
          themeColor: response.settings?.themeColor || '',
          updatedAt: { toDate: () => response.settings?.updatedAt?.toDate() || new Date() },
        },
      }
    },
  },
}
