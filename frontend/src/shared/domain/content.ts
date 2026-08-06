export interface DateValue {
  toDate?: () => Date
}

export interface BlogArticle {
  id: string
  title: string
  content: string
  folderId: string
  tags: string[]
  status: 'draft' | 'published'
  createdAt?: DateValue
  updatedAt?: DateValue
}

export interface FolderNode {
  id: string
  name: string
  children?: FolderNode[]
}

export interface Album {
  id: string
  name: string
  description: string
  isPublic: boolean
  createdAt: DateValue
}

export interface AlbumImage {
  id: string
  albumId: string
  url: string
  thumbnailUrl?: string
  fileName: string
  fileSize: number
  mimeType: string
  createdAt: DateValue
}

export interface ImageReferenceItem {
  imageId: string
  url: string
  fileName: string
  referenceCount: number
  postReferenceCount: number
  blogReferenceCount: number
  avatarReferenceCount: number
  backgroundReferenceCount: number
  faviconReferenceCount: number
  safeToDelete: boolean
}
