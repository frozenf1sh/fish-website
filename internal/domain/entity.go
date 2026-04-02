package domain

import (
	"time"
)

// Post represents a timeline post
type Post struct {
	ID        string
	Content   string
	ImageURLs []string
	CreatedAt time.Time
}

// Folder represents a blog folder category
type Folder struct {
	ID             string
	Name           string
	ParentFolderID string
	Children       []*Folder
}

// Article represents a blog article
type Article struct {
	ID        string
	Title     string
	Content   string
	FolderID  string
	Tags      []string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// Album represents a photo album
type Album struct {
	ID          string
	Name        string
	Description string
	IsPublic    bool
	CreatedAt   time.Time
}

// Image represents an uploaded image
type Image struct {
	ID           string
	AlbumID      string
	URL          string
	ThumbnailURL string
	FileName     string
	FileSize     int64
	MimeType     string
	CreatedAt    time.Time
}

// Settings represents user settings
type Settings struct {
	DisplayName         string
	Bio               string
	AvatarURL         string
	TwitterURL       string
	GitHubURL        string
	BilibiliURL      string
	CustomLinks       string // JSON string
	BackgroundImageURL string
	SakuraParticlesEnabled bool
	ThemeColor        string
	UpdatedAt         time.Time
}
