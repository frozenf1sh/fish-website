package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/frozenfish/fish-website/internal/domain"
	"github.com/frozenfish/fish-website/pkg/logger"
	"github.com/rs/xid"
)

const (
	recycleBinAlbumID   = "recycle-bin"
	recycleBinAlbumName = "回收站"
	defaultAlbumID      = "default"
)

// AlbumUsecase handles album business logic
type AlbumUsecase struct {
	albumRepo   domain.AlbumRepository
	fileStorage domain.FileStorage
}

// NewAlbumUsecase creates a new AlbumUsecase
func NewAlbumUsecase(albumRepo domain.AlbumRepository, fileStorage domain.FileStorage) *AlbumUsecase {
	u := &AlbumUsecase{
		albumRepo:   albumRepo,
		fileStorage: fileStorage,
	}
	go u.startRecycleBinCleaner()
	return u
}

func (u *AlbumUsecase) ensureRecycleBinAlbum(ctx context.Context) error {
	_, err := u.albumRepo.GetAlbum(ctx, recycleBinAlbumID)
	if err == nil {
		return nil
	}
	_, err = u.albumRepo.CreateAlbum(ctx, &domain.Album{
		ID:          recycleBinAlbumID,
		Name:        recycleBinAlbumName,
		Description: "系统回收站（每日零点自动清空）",
		IsPublic:    false,
		CreatedAt:   time.Now(),
	})
	if err != nil {
		return fmt.Errorf("create recycle bin album: %w", err)
	}
	return nil
}

func nextMidnight(t time.Time) time.Time {
	y, m, d := t.Date()
	loc := t.Location()
	return time.Date(y, m, d+1, 0, 0, 0, 0, loc)
}

func (u *AlbumUsecase) purgeRecycleBin() {
	ctx := context.Background()
	if err := u.ensureRecycleBinAlbum(ctx); err != nil {
		logger.Error("ensure recycle bin before purge failed", logger.Err(err))
		return
	}

	for {
		images, _, hasMore, err := u.albumRepo.ListImagesByAlbum(ctx, recycleBinAlbumID, 200, "")
		if err != nil {
			logger.Error("list recycle bin images failed", logger.Err(err))
			return
		}
		if len(images) == 0 {
			return
		}

		imageIDs := make([]string, 0, len(images))
		for _, image := range images {
			imageIDs = append(imageIDs, image.ID)
		}

		deletedImages, err := u.albumRepo.DeleteImages(ctx, recycleBinAlbumID, imageIDs)
		if err != nil {
			logger.Error("delete recycle bin images failed", logger.Err(err))
			return
		}

		for _, image := range deletedImages {
			objectName := fmt.Sprintf("images/%s/%s", image.AlbumID, image.ID)
			if err := u.fileStorage.DeleteObject(ctx, objectName); err != nil {
				logger.Error("purge recycle object failed", logger.String("image_id", image.ID), logger.Err(err))
			}
		}

		if !hasMore {
			return
		}
	}
}

func (u *AlbumUsecase) startRecycleBinCleaner() {
	for {
		now := time.Now()
		target := nextMidnight(now)
		timer := time.NewTimer(time.Until(target))
		<-timer.C
		timer.Stop()
		u.purgeRecycleBin()
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

func (u *AlbumUsecase) UpdateAlbum(ctx context.Context, albumID, name, description string, isPublic bool) (*domain.Album, error) {
	if albumID == "" {
		return nil, fmt.Errorf("album id is required")
	}
	if albumID == defaultAlbumID || albumID == recycleBinAlbumID {
		return nil, fmt.Errorf("default album and recycle bin cannot be renamed")
	}
	album, err := u.albumRepo.GetAlbum(ctx, albumID)
	if err != nil {
		return nil, fmt.Errorf("get album: %w", err)
	}
	album.Name = name
	album.Description = description
	album.IsPublic = isPublic
	updated, err := u.albumRepo.UpdateAlbum(ctx, album)
	if err != nil {
		return nil, fmt.Errorf("update album: %w", err)
	}
	return updated, nil
}

func (u *AlbumUsecase) MoveImages(ctx context.Context, fromAlbumID, targetAlbumID string, imageIDs []string) (int, error) {
	if fromAlbumID == "" || targetAlbumID == "" {
		return 0, fmt.Errorf("source and target album ids are required")
	}
	if fromAlbumID == targetAlbumID {
		return 0, nil
	}
	if len(imageIDs) == 0 {
		return 0, nil
	}
	if _, err := u.albumRepo.GetAlbum(ctx, fromAlbumID); err != nil {
		return 0, fmt.Errorf("get source album: %w", err)
	}
	if _, err := u.albumRepo.GetAlbum(ctx, targetAlbumID); err != nil {
		return 0, fmt.Errorf("get target album: %w", err)
	}
	moved, err := u.albumRepo.MoveImagesToAlbum(ctx, fromAlbumID, imageIDs, targetAlbumID)
	if err != nil {
		return 0, fmt.Errorf("move images: %w", err)
	}
	return len(moved), nil
}

// ListAlbums lists albums with pagination
func (u *AlbumUsecase) ListAlbums(ctx context.Context, pageSize int, pageToken string, onlyPublic bool) ([]*domain.Album, string, bool, error) {
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	if !onlyPublic {
		if err := u.ensureRecycleBinAlbum(ctx); err != nil {
			return nil, "", false, err
		}
	}

	albums, nextPageToken, hasMore, err := u.albumRepo.ListAlbums(ctx, pageSize, pageToken, onlyPublic)
	if err != nil {
		return nil, "", false, fmt.Errorf("list albums: %w", err)
	}

	return albums, nextPageToken, hasMore, nil
}

// GetAlbumWithImages gets one album and its images
func (u *AlbumUsecase) GetAlbumWithImages(ctx context.Context, albumID string, includePrivate bool) (*domain.Album, []*domain.Image, error) {
	album, err := u.albumRepo.GetAlbum(ctx, albumID)
	if err != nil {
		return nil, nil, fmt.Errorf("get album: %w", err)
	}
	if !includePrivate && !album.IsPublic {
		return nil, nil, domain.ErrUnauthorized
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
				IsPublic:    false,
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
		return 0, nextMidnight(time.Now()), nil
	}
	if albumID == recycleBinAlbumID {
		deletedImages, err := u.albumRepo.DeleteImages(ctx, albumID, imageIDs)
		if err != nil {
			return 0, time.Time{}, fmt.Errorf("delete recycle images: %w", err)
		}
		for _, image := range deletedImages {
			objectName := fmt.Sprintf("images/%s/%s", image.AlbumID, image.ID)
			if err := u.fileStorage.DeleteObject(ctx, objectName); err != nil {
				logger.Error("delete recycle object failed", logger.String("image_id", image.ID), logger.Err(err))
			}
		}
		return len(deletedImages), time.Now(), nil
	}

	if err := u.ensureRecycleBinAlbum(ctx); err != nil {
		return 0, time.Time{}, err
	}

	movedImages, err := u.albumRepo.MoveImagesToAlbum(ctx, albumID, imageIDs, recycleBinAlbumID)
	if err != nil {
		return 0, time.Time{}, fmt.Errorf("move images to recycle bin: %w", err)
	}

	return len(movedImages), nextMidnight(time.Now()), nil
}

func (u *AlbumUsecase) DeleteAlbum(ctx context.Context, albumID string) error {
	if albumID == "" {
		return fmt.Errorf("album id is required")
	}
	if albumID == defaultAlbumID || albumID == recycleBinAlbumID {
		return fmt.Errorf("default album and recycle bin cannot be deleted")
	}
	if _, err := u.albumRepo.GetAlbum(ctx, albumID); err != nil {
		return fmt.Errorf("get album: %w", err)
	}
	if err := u.ensureRecycleBinAlbum(ctx); err != nil {
		return err
	}

	pageToken := ""
	for {
		images, nextToken, hasMore, err := u.albumRepo.ListImagesByAlbum(ctx, albumID, 500, pageToken)
		if err != nil {
			return fmt.Errorf("list album images: %w", err)
		}
		if len(images) > 0 {
			imageIDs := make([]string, 0, len(images))
			for _, image := range images {
				imageIDs = append(imageIDs, image.ID)
			}
			if _, err := u.albumRepo.MoveImagesToAlbum(ctx, albumID, imageIDs, recycleBinAlbumID); err != nil {
				return fmt.Errorf("move album images to recycle bin: %w", err)
			}
		}
		if !hasMore {
			break
		}
		pageToken = nextToken
	}

	if err := u.albumRepo.DeleteAlbum(ctx, albumID); err != nil {
		return fmt.Errorf("delete album: %w", err)
	}
	return nil
}
