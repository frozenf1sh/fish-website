package domain

import (
	"context"
	"time"
)

// PostRepository defines the interface for post data access
type PostRepository interface {
	Create(ctx context.Context, post *Post) (*Post, error)
	List(ctx context.Context, pageSize int, pageToken string) ([]*Post, string, bool, error)
	Get(ctx context.Context, id string) (*Post, error)
	Update(ctx context.Context, post *Post) (*Post, error)
	Delete(ctx context.Context, id string) error
}

// BlogRepository defines the interface for blog data access
type BlogRepository interface {
	CreateArticle(ctx context.Context, article *Article) (*Article, error)
	UpdateArticle(ctx context.Context, article *Article) (*Article, error)
	DeleteArticle(ctx context.Context, articleID string) error
	ListArticles(ctx context.Context, pageSize int, pageToken string, folderID string, tag string, status string) ([]*Article, string, bool, error)
	GetArticle(ctx context.Context, articleID string) (*Article, error)
	CreateFolder(ctx context.Context, folder *Folder) (*Folder, error)
	UpdateFolder(ctx context.Context, folder *Folder) (*Folder, error)
	DeleteFolder(ctx context.Context, folderID string) error
	GetFolders(ctx context.Context) ([]*Folder, error)
}

// AlbumRepository defines the interface for album data access
type AlbumRepository interface {
	CreateAlbum(ctx context.Context, album *Album) (*Album, error)
	UpdateAlbum(ctx context.Context, album *Album) (*Album, error)
	ListAlbums(ctx context.Context, pageSize int, pageToken string, onlyPublic bool) ([]*Album, string, bool, error)
	GetAlbum(ctx context.Context, albumID string) (*Album, error)
	CreateImage(ctx context.Context, image *Image) (*Image, error)
	ListImagesByAlbum(ctx context.Context, albumID string, pageSize int, pageToken string) ([]*Image, string, bool, error)
	GetImage(ctx context.Context, imageID string) (*Image, error)
	UpdateImage(ctx context.Context, image *Image) (*Image, error)
	MoveImagesToAlbum(ctx context.Context, fromAlbumID string, imageIDs []string, targetAlbumID string) ([]*Image, error)
	SetImageDate(ctx context.Context, albumID string, imageIDs []string, photoDate time.Time) (int, error)
	DeleteImages(ctx context.Context, albumID string, imageIDs []string) ([]*Image, error)
	DeleteAlbum(ctx context.Context, albumID string) error
}

// SettingsRepository defines the interface for settings data access
type SettingsRepository interface {
	Get(ctx context.Context) (*Settings, error)
	Update(ctx context.Context, settings *Settings) (*Settings, error)
}

// ProjectRepository defines public project showcase data access.
type ProjectRepository interface {
	List(ctx context.Context) ([]*Project, error)
	Get(ctx context.Context, id string) (*Project, error)
	Create(ctx context.Context, project *Project) (*Project, error)
	Update(ctx context.Context, project *Project) (*Project, error)
	Delete(ctx context.Context, id string) error
	Reorder(ctx context.Context, ids []string) error
}

// AboutRepository defines the editable about page data access.
type AboutRepository interface {
	ListImages(ctx context.Context) ([]*AboutImage, error)
	GetFeaturedArticleID(ctx context.Context) (string, error)
	SetFeaturedArticleID(ctx context.Context, articleID string) error
	AddImage(ctx context.Context, image *AboutImage) (*AboutImage, error)
	RemoveImage(ctx context.Context, id string) error
	ReorderImages(ctx context.Context, ids []string) error
}

// ObjectStore is the media bounded context's outbound storage port. It does
// not expose provider concepts (R2, S3 or MinIO) to application code.
type ObjectStore interface {
	GetPresignedUploadURL(ctx context.Context, objectName string, contentType string, fileSize int64, expires time.Duration) (uploadURL string, headers map[string]string, err error)
	GetFileURL(ctx context.Context, objectName string) (string, error)
	HeadObject(ctx context.Context, objectName string) (ObjectMetadata, error)
	IsObjectExists(ctx context.Context, objectName string) (bool, error)
	DeleteObject(ctx context.Context, objectName string) error
}

// ImageReferenceRepository tracks and analyzes image usage references.
type ImageReferenceRepository interface {
	ReplaceSourceReferences(ctx context.Context, sourceType, sourceID string, urls []string) error
	ReplaceSourceImageIDs(ctx context.Context, sourceType, sourceID string, imageIDs []string) error
	RemoveSourceReferences(ctx context.Context, sourceType, sourceID string) error
	AnalyzeByAlbum(ctx context.Context, albumID string) ([]*ImageReferenceRecord, error)
	RepairConsistency(ctx context.Context) (*ImageReferenceRepairResult, error)
}
