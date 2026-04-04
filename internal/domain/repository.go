package domain

import (
	"context"
	"time"
)

// PostRepository defines the interface for post data access
type PostRepository interface {
	Create(ctx context.Context, post *Post) (*Post, error)
	List(ctx context.Context, pageSize int, pageToken string) ([]*Post, string, bool, error)
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
	GetFolders(ctx context.Context) ([]*Folder, error)
}

// AlbumRepository defines the interface for album data access
type AlbumRepository interface {
	CreateAlbum(ctx context.Context, album *Album) (*Album, error)
	ListAlbums(ctx context.Context, pageSize int, pageToken string, onlyPublic bool) ([]*Album, string, bool, error)
	GetAlbum(ctx context.Context, albumID string) (*Album, error)
	CreateImage(ctx context.Context, image *Image) (*Image, error)
	ListImagesByAlbum(ctx context.Context, albumID string, pageSize int, pageToken string) ([]*Image, string, bool, error)
	GetImage(ctx context.Context, imageID string) (*Image, error)
	UpdateImage(ctx context.Context, image *Image) (*Image, error)
	DeleteImages(ctx context.Context, albumID string, imageIDs []string) ([]*Image, error)
}

// SettingsRepository defines the interface for settings data access
type SettingsRepository interface {
	Get(ctx context.Context) (*Settings, error)
	Update(ctx context.Context, settings *Settings) (*Settings, error)
}

// FileStorage defines the interface for file storage operations
type FileStorage interface {
	GetPresignedUploadURL(ctx context.Context, objectName string, contentType string, fileSize int64, expires time.Duration) (uploadURL string, headers map[string]string, err error)
	GetFileURL(ctx context.Context, objectName string) (string, error)
	IsObjectExists(ctx context.Context, objectName string) (bool, error)
	DeleteObject(ctx context.Context, objectName string) error
}
