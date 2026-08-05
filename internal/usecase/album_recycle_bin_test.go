package usecase

import (
	"context"
	"errors"
	"testing"

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
	repo := &purgeAlbumRepository{images: []*domain.Image{{ID: "image-1", AlbumID: recycleBinAlbumID}}}
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
	if len(storage.deleted) != 1 || storage.deleted[0] != "images/recycle-bin/image-1" {
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
