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
	UpdatedAt time.Time
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
	Status    string
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
	ID      string
	AlbumID string
	// ObjectKey is the immutable object-store identifier. URL is a derived
	// delivery value retained during the legacy-reference migration.
	ObjectKey          string
	ThumbnailObjectKey string
	URL                string
	ThumbnailURL       string
	FileName           string
	FileSize           int64
	MimeType           string
	CreatedAt          time.Time
}

// ObjectMetadata is the verified subset of an object-store HEAD response.
type ObjectMetadata struct {
	Size        int64
	ContentType string
}

// Settings represents user settings
type Settings struct {
	DisplayName            string
	Bio                    string
	AvatarURL              string
	TwitterURL             string
	GitHubURL              string
	BilibiliURL            string
	CustomLinks            string // JSON string
	BackgroundImageURL     string
	SakuraParticlesEnabled bool
	ThemeColor             string
	UpdatedAt              time.Time
}

// ImageReferenceRecord stores aggregated references for one image.
type ImageReferenceRecord struct {
	ImageID            string
	URL                string
	FileName           string
	ReferenceCount     int
	PostReferenceCount int
	BlogReferenceCount int
	AvatarRefCount     int
	BackgroundRefCount int
	FaviconRefCount    int
}

// ImageReferenceSummary summarizes analysis for an album.
type ImageReferenceSummary struct {
	AlbumID          string
	TotalImages      int
	DeletableImages  int
	ReferencedImages int
	TotalRefCount    int
	LastRepairedAt   time.Time
}

// ImageReferenceRepairResult reports data repaired by consistency rebuild.
type ImageReferenceRepairResult struct {
	ProcessedImages  int
	ReferencedImages int
	TotalRefCount    int
	RepairedAt       time.Time
}
