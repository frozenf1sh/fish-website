package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/frozenfish/fish-website/internal/domain"
	"github.com/frozenfish/fish-website/pkg/logger"
	"github.com/rs/xid"
)

const imageDeleteDelay = 30 * time.Second

// AlbumUsecase handles album business logic
type AlbumUsecase struct {
	albumRepo   domain.AlbumRepository
	fileStorage domain.FileStorage
}

// NewAlbumUsecase creates a new AlbumUsecase
func NewAlbumUsecase(albumRepo domain.AlbumRepository, fileStorage domain.FileStorage) *AlbumUsecase {
	return &AlbumUsecase{
		albumRepo:   albumRepo,
		fileStorage: fileStorage,
	}
}

// CreateAlbum creates a new album
func (u *AlbumUsecase) CreateAlbum(ctx context.Context, name, description string, isPublic bool) (*domain.Album, error) {
	album := &domain.Album{
		Name:        name,
		Description: description,
		IsPublic:    isPublic,
		CreatedAt:   time.Now(),
	}

	createdAlbum, err := u.albumRepo.CreateAlbum(ctx, album)
	if err != nil {
		return nil, fmt.Errorf("create album: %w", err)
	}

	return createdAlbum, nil
}

// ListAlbums lists albums with pagination
func (u *AlbumUsecase) ListAlbums(ctx context.Context, pageSize int, pageToken string, onlyPublic bool) ([]*domain.Album, string, bool, error) {
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	albums, nextPageToken, hasMore, err := u.albumRepo.ListAlbums(ctx, pageSize, pageToken, onlyPublic)
	if err != nil {
		return nil, "", false, fmt.Errorf("list albums: %w", err)
	}

	return albums, nextPageToken, hasMore, nil
}

// GetAlbumWithImages gets one album and its images
func (u *AlbumUsecase) GetAlbumWithImages(ctx context.Context, albumID string) (*domain.Album, []*domain.Image, error) {
	album, err := u.albumRepo.GetAlbum(ctx, albumID)
	if err != nil {
		return nil, nil, fmt.Errorf("get album: %w", err)
	}

	images, _, _, err := u.albumRepo.ListImagesByAlbum(ctx, albumID, 500, "")
	if err != nil {
		return nil, nil, fmt.Errorf("list album images: %w", err)
	}

	return album, images, nil
}

// GetPresignedUploadURL gets a presigned URL for uploading an image
func (u *AlbumUsecase) GetPresignedUploadURL(ctx context.Context, albumID, fileName, mimeType string, fileSize int64) (uploadURL string, imageID string, headers map[string]string, expiresAt time.Time, err error) {
	// Verify album exists
	_, err = u.albumRepo.GetAlbum(ctx, albumID)
	if err != nil {
		if albumID == "default" {
			// Auto create the default album
			_, err = u.albumRepo.CreateAlbum(ctx, &domain.Album{
				ID:          "default",
				Name:        "默认相册",
				Description: "系统默认创建的相册",
				IsPublic:    true,
				CreatedAt:   time.Now(),
			})
			if err != nil {
				return "", "", nil, time.Time{}, fmt.Errorf("create default album: %w", err)
			}
		} else {
			return "", "", nil, time.Time{}, fmt.Errorf("get album: %w", err)
		}
	}

	imageID = xid.New().String()
	objectName := fmt.Sprintf("images/%s/%s", albumID, imageID)
	expiresAt = time.Now().Add(1 * time.Hour)

	uploadURL, headers, err = u.fileStorage.GetPresignedUploadURL(ctx, objectName, mimeType, fileSize, time.Until(expiresAt))
	if err != nil {
		return "", "", nil, time.Time{}, fmt.Errorf("get presigned url: %w", err)
	}

	// Create a pending image record
	image := &domain.Image{
		ID:        imageID,
		AlbumID:   albumID,
		FileName:  fileName,
		FileSize:  fileSize,
		MimeType:  mimeType,
		CreatedAt: time.Now(),
	}

	_, err = u.albumRepo.CreateImage(ctx, image)
	if err != nil {
		return "", "", nil, time.Time{}, fmt.Errorf("create image record: %w", err)
	}

	return uploadURL, imageID, headers, expiresAt, nil
}

// ConfirmImageUpload confirms that an image has been uploaded
func (u *AlbumUsecase) ConfirmImageUpload(ctx context.Context, imageID, uploadURL string) (*domain.Image, error) {
	image, err := u.albumRepo.GetImage(ctx, imageID)
	if err != nil {
		return nil, fmt.Errorf("get image: %w", err)
	}

	// Verify the object exists in storage
	objectName := fmt.Sprintf("images/%s/%s", image.AlbumID, imageID)
	exists, err := u.fileStorage.IsObjectExists(ctx, objectName)
	if err != nil {
		return nil, fmt.Errorf("check object exists: %w", err)
	}
	if !exists {
		return nil, domain.ErrImageNotUploaded
	}

	// Get the permanent URL
	fileURL, err := u.fileStorage.GetFileURL(ctx, objectName)
	if err != nil {
		return nil, fmt.Errorf("get file url: %w", err)
	}

	image.URL = fileURL
	// TODO: Generate thumbnail in a real implementation
	image.ThumbnailURL = fileURL

	updatedImage, err := u.albumRepo.UpdateImage(ctx, image)
	if err != nil {
		return nil, fmt.Errorf("update image: %w", err)
	}

	return updatedImage, nil
}

// DeleteImages deletes image records first and removes objects from storage after a delay.
func (u *AlbumUsecase) DeleteImages(ctx context.Context, albumID string, imageIDs []string) (int, time.Time, error) {
	if len(imageIDs) == 0 {
		return 0, time.Now().Add(imageDeleteDelay), nil
	}

	deletedImages, err := u.albumRepo.DeleteImages(ctx, albumID, imageIDs)
	if err != nil {
		return 0, time.Time{}, fmt.Errorf("delete image records: %w", err)
	}

	scheduledAt := time.Now().Add(imageDeleteDelay)
	imagesSnapshot := make([]*domain.Image, len(deletedImages))
	copy(imagesSnapshot, deletedImages)

	go func(images []*domain.Image, deleteAt time.Time) {
		timer := time.NewTimer(time.Until(deleteAt))
		defer timer.Stop()
		<-timer.C

		for _, image := range images {
			objectName := fmt.Sprintf("images/%s/%s", image.AlbumID, image.ID)
			if err := u.fileStorage.DeleteObject(context.Background(), objectName); err != nil {
				logger.Error("delayed image object deletion failed",
					logger.String("image_id", image.ID),
					logger.String("object_name", objectName),
					logger.Err(err),
				)
			}
		}
	}(imagesSnapshot, scheduledAt)

	return len(deletedImages), scheduledAt, nil
}
