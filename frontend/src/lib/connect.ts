// @ts-nocheck
import { createPromiseClient } from '@connectrpc/connect'
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
  interceptors: [
    (next) => async (req) => {
      const token = getAuthToken()
      if (token) {
        req.header.set('Authorization', `Bearer ${token}`)
      }
      return await next(req)
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

function createAuthenticatedClient(service) {
  return createPromiseClient(service, transport)
}

const authClient = createAuthenticatedClient(AuthService)
const postClient = createAuthenticatedClient(PostService)
const blogClient = createAuthenticatedClient(BlogService)
const albumClient = createAuthenticatedClient(AlbumService)
const settingsClient = createAuthenticatedClient(SettingsService)

export const clients = {
  auth: {
    login: async (req) => {
      const response = await authClient.login(req)
      return {
        token: response.token,
        expiresAt: {
          toDate: () => response.expiresAt?.toDate() || new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      }
    },
  },
  post: {
    createPost: async (req) => {
      const response = await postClient.createPost(req)
      return { post: response.post ? { id: response.post.id } : { id: 'new-post' } }
    },
    listPosts: async (req = {}) => {
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
        })),
        nextPageToken: response.nextPageToken,
        hasMore: response.hasMore,
      }
    },
    deletePost: async (req) => {
      await postClient.deletePost(req)
      return {}
    },
  },
  blog: {
    createArticle: async (req) => {
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
    updateArticle: async (req) => {
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
    deleteArticle: async (req) => {
      await blogClient.deleteArticle({ articleId: req.articleId })
      return {}
    },
    listArticles: async (req = {}) => {
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
    getArticle: async (req) => {
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
    createFolder: async (req) => {
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
    updateFolder: async (req) => {
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
  },
  album: {
    createAlbum: async (req) => {
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
    listAlbums: async (req = {}) => {
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
    getAlbum: async (req) => {
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
    uploadImageRequest: async (req) => {
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
    confirmImageUpload: async (req) => {
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
    deleteImages: async (req) => {
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
  },
  settings: {
    getSettings: async () => {
      const response = await settingsClient.getSettings({})
      return {
        settings: response.settings
          ? {
              displayName: response.settings.displayName,
              bio: response.settings.bio,
              avatarUrl: response.settings.avatarUrl,
              twitterUrl: response.settings.twitterUrl,
              githubUrl: response.settings.githubUrl,
              bilibiliUrl: response.settings.bilibiliUrl,
              customLinks: response.settings.customLinks,
              backgroundImageUrl: response.settings.backgroundImageUrl,
              sakuraParticlesEnabled: response.settings.sakuraParticlesEnabled,
              themeColor: response.settings.themeColor,
              updatedAt: { toDate: () => response.settings.updatedAt?.toDate() || new Date() },
            }
          : null,
      }
    },
    updateSettings: async (req) => {
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
        (key) => key !== 'updatedAt'
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
