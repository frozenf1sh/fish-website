package usecase

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/frozenfish/fish-website/internal/domain"
)

type purgeAlbumRepository struct {
	domain.AlbumRepository
	images       []*domain.Image
	deletedImage []string
}

func (r *purgeAlbumRepository) GetAlbum(context.Context, string) (*domain.Album, error) {
	return &domain.Album{ID: recycleBinAlbumID}, nil
}

func (r *purgeAlbumRepository) ListImagesByAlbum(context.Context, string, int, string) ([]*domain.Image, string, bool, error) {
	images := r.images
	r.images = nil
	return images, "", false, nil
}

func (r *purgeAlbumRepository) DeleteImages(_ context.Context, _ string, imageIDs []string) ([]*domain.Image, error) {
	r.deletedImage = append(r.deletedImage, imageIDs...)
	return nil, nil
}

type purgeFileStorage struct {
	domain.ObjectStore
	deleteErr error
	deleted   []string
}

func (s *purgeFileStorage) DeleteObject(_ context.Context, objectName string) error {
	s.deleted = append(s.deleted, objectName)
	return s.deleteErr
}

func TestPurgeRecycleBinDeletesObjectBeforeMetadata(t *testing.T) {
	repo := &purgeAlbumRepository{images: []*domain.Image{{
		ID: "image-1", AlbumID: recycleBinAlbumID, ObjectKey: "images/original-album/image-1",
	}}}
	storage := &purgeFileStorage{}

	purged, err := NewAlbumUsecase(repo, storage, nil).PurgeRecycleBin(context.Background())
	if err != nil {
		t.Fatalf("PurgeRecycleBin() error = %v", err)
	}
	if purged != 1 {
		t.Fatalf("purged = %d, want 1", purged)
	}
	if len(repo.deletedImage) != 1 || repo.deletedImage[0] != "image-1" {
		t.Fatalf("deleted metadata = %v, want [image-1]", repo.deletedImage)
	}
	if len(storage.deleted) != 1 || storage.deleted[0] != "images/original-album/image-1" {
		t.Fatalf("deleted objects = %v", storage.deleted)
	}
}

func TestPurgeRecycleBinKeepsMetadataWhenObjectDeletionFails(t *testing.T) {
	repo := &purgeAlbumRepository{images: []*domain.Image{{ID: "image-1", AlbumID: recycleBinAlbumID}}}
	storage := &purgeFileStorage{deleteErr: errors.New("object storage unavailable")}

	purged, err := NewAlbumUsecase(repo, storage, nil).PurgeRecycleBin(context.Background())
	if err == nil {
		t.Fatal("PurgeRecycleBin() error = nil, want storage error")
	}
	if purged != 0 {
		t.Fatalf("purged = %d, want 0", purged)
	}
	if len(repo.deletedImage) != 0 {
		t.Fatalf("metadata deletion = %v, want none", repo.deletedImage)
	}
}

type uploadAlbumRepository struct {
	domain.AlbumRepository
	created *domain.Image
	images  []*domain.Image
}

func (r *uploadAlbumRepository) GetAlbum(context.Context, string) (*domain.Album, error) {
	return &domain.Album{ID: "album-1", IsPublic: true}, nil
}

func (r *uploadAlbumRepository) CreateImage(_ context.Context, image *domain.Image) (*domain.Image, error) {
	r.created = image
	return image, nil
}

func (r *uploadAlbumRepository) ListImagesByAlbum(context.Context, string, int, string) ([]*domain.Image, string, bool, error) {
	return r.images, "", false, nil
}

type uploadObjectStore struct {
	domain.ObjectStore
	presignedObjectKey string
}

func (s *uploadObjectStore) GetPresignedUploadURL(_ context.Context, objectKey, _ string, _ int64, _ time.Duration) (string, map[string]string, error) {
	s.presignedObjectKey = objectKey
	return "https://r2.example/upload", map[string]string{"Content-Type": "image/png"}, nil
}

func (s *uploadObjectStore) GetFileURL(_ context.Context, objectKey string) (string, error) {
	return "https://media.example/" + objectKey, nil
}

func TestGetPresignedUploadURLPersistsObjectKey(t *testing.T) {
	repo := &uploadAlbumRepository{}
	store := &uploadObjectStore{}

	_, imageID, _, _, err := NewAlbumUsecase(repo, store, nil).GetPresignedUploadURL(
		context.Background(), "album-1", "image.png", "image/png", 42,
	)
	if err != nil {
		t.Fatalf("GetPresignedUploadURL() error = %v", err)
	}
	if repo.created == nil {
		t.Fatal("CreateImage was not called")
	}
	if repo.created.ObjectKey == "" || repo.created.ObjectKey != store.presignedObjectKey {
		t.Fatalf("stored object key = %q, presigned key = %q", repo.created.ObjectKey, store.presignedObjectKey)
	}
	if !strings.HasPrefix(repo.created.ObjectKey, "images/album-1/") {
		t.Fatalf("stored object key = %q, want images/album-1/*", repo.created.ObjectKey)
	}
	if !strings.HasSuffix(repo.created.ObjectKey, imageID) {
		t.Fatalf("stored object key = %q does not contain image id %q", repo.created.ObjectKey, imageID)
	}
	if repo.created.URL != "" {
		t.Fatalf("pending image URL = %q, want empty", repo.created.URL)
	}
}

func TestGetAlbumWithImagesResolvesURLFromObjectKey(t *testing.T) {
	repo := &uploadAlbumRepository{images: []*domain.Image{{
		ID: "image-1", AlbumID: "album-1", ObjectKey: "images/original-album/image-1", URL: "https://legacy.example/stale",
	}}}
	store := &uploadObjectStore{}

	_, images, err := NewAlbumUsecase(repo, store, nil).GetAlbumWithImages(context.Background(), "album-1", false)
	if err != nil {
		t.Fatalf("GetAlbumWithImages() error = %v", err)
	}
	want := "https://media.example/images/original-album/image-1"
	if images[0].URL != want || images[0].ThumbnailURL != want {
		t.Fatalf("resolved URLs = (%q, %q), want (%q, %q)", images[0].URL, images[0].ThumbnailURL, want, want)
	}
}

func TestValidateImageUpload(t *testing.T) {
	tests := []struct {
		name      string
		fileName  string
		mimeType  string
		fileSize  int64
		wantError bool
	}{
		{name: "valid webp", fileName: "photo.webp", mimeType: "image/webp", fileSize: 1},
		{name: "mime parameters", fileName: "photo.png", mimeType: "image/png; charset=binary", fileSize: 1},
		{name: "svg denied", fileName: "payload.svg", mimeType: "image/svg+xml", fileSize: 1, wantError: true},
		{name: "empty file", fileName: "photo.png", mimeType: "image/png", fileSize: 0, wantError: true},
		{name: "oversized", fileName: "photo.png", mimeType: "image/png", fileSize: maxImageUploadBytes + 1, wantError: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateImageUpload(test.fileName, test.mimeType, test.fileSize)
			if (err != nil) != test.wantError {
				t.Fatalf("validateImageUpload() error = %v, wantError %v", err, test.wantError)
			}
		})
	}
}
