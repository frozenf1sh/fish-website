package usecase

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/frozenfish/fish-website/internal/domain"
)

const (
	recycleBinAlbumID   = "recycle-bin"
	recycleBinAlbumName = "回收站"
	defaultAlbumID      = "default"
)

// AlbumUsecase handles album business logic
type AlbumUsecase struct {
	albumRepo    domain.AlbumRepository
	objectStore  domain.ObjectStore
	imageRefRepo domain.ImageReferenceRepository
}

// NewAlbumUsecase creates a new AlbumUsecase
func NewAlbumUsecase(albumRepo domain.AlbumRepository, objectStore domain.ObjectStore, imageRefRepo domain.ImageReferenceRepository) *AlbumUsecase {
	return &AlbumUsecase{
		albumRepo:    albumRepo,
		objectStore:  objectStore,
		imageRefRepo: imageRefRepo,
	}
}

func (u *AlbumUsecase) AnalyzeImageReferences(ctx context.Context, albumID string) ([]*domain.ImageReferenceRecord, *domain.ImageReferenceSummary, error) {
	records, err := u.imageRefRepo.AnalyzeByAlbum(ctx, albumID)
	if err != nil {
		return nil, nil, fmt.Errorf("analyze image references: %w", err)
	}

	summary := &domain.ImageReferenceSummary{AlbumID: albumID, TotalImages: len(records)}
	for _, rec := range records {
		summary.TotalRefCount += rec.ReferenceCount
		if rec.ReferenceCount > 0 {
			summary.ReferencedImages += 1
		} else {
			summary.DeletableImages += 1
		}
	}

	return records, summary, nil
}

func (u *AlbumUsecase) RepairImageReferenceConsistency(ctx context.Context) (*domain.ImageReferenceRepairResult, error) {
	result, err := u.imageRefRepo.RepairConsistency(ctx)
	if err != nil {
		return nil, fmt.Errorf("repair image references: %w", err)
	}
	return result, nil
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

// PurgeRecycleBin permanently removes all images currently in the recycle
// bin. It is deliberately a bounded, one-shot application command so that a
// platform scheduler can own retries, observability and concurrency.
//
// Objects are removed before their metadata. This ordering preserves a retry
// path when object storage is temporarily unavailable: metadata remains until
// the object has been removed (or is already absent).
func (u *AlbumUsecase) PurgeRecycleBin(ctx context.Context) (int, error) {
	if err := u.ensureRecycleBinAlbum(ctx); err != nil {
		return 0, err
	}

	purged := 0
	for {
		images, _, hasMore, err := u.albumRepo.ListImagesByAlbum(ctx, recycleBinAlbumID, 200, "")
		if err != nil {
			return purged, fmt.Errorf("list recycle bin images: %w", err)
		}
		if len(images) == 0 {
			return purged, nil
		}

		deletedIDs := make([]string, 0, len(images))
		var objectErrors []error
		for _, image := range images {
			objectName := imageObjectKey(image)
			if err := u.objectStore.DeleteObject(ctx, objectName); err != nil {
				objectErrors = append(objectErrors, fmt.Errorf("delete object for image %s: %w", image.ID, err))
				continue
			}
			deletedIDs = append(deletedIDs, image.ID)
		}

		if len(deletedIDs) > 0 {
			if _, err := u.albumRepo.DeleteImages(ctx, recycleBinAlbumID, deletedIDs); err != nil {
				return purged, fmt.Errorf("delete recycle bin metadata: %w", err)
			}
			purged += len(deletedIDs)
		}

		if len(objectErrors) > 0 {
			return purged, fmt.Errorf("purge recycle bin objects: %w", errors.Join(objectErrors...))
		}

		if !hasMore {
			return purged, nil
		}
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
	for _, album := range albums {
		if album.ID == defaultAlbumID || album.ID == recycleBinAlbumID {
			album.IsPublic = false
		}
	}

	return albums, nextPageToken, hasMore, nil
}

// GetAlbumWithImages gets one album and its images
func (u *AlbumUsecase) GetAlbumWithImages(ctx context.Context, albumID string, includePrivate bool) (*domain.Album, []*domain.Image, error) {
	album, err := u.albumRepo.GetAlbum(ctx, albumID)
	if err != nil {
		return nil, nil, fmt.Errorf("get album: %w", err)
	}
	if album.ID == defaultAlbumID || album.ID == recycleBinAlbumID {
		album.IsPublic = false
	}
	if !includePrivate && !album.IsPublic {
		return nil, nil, domain.ErrUnauthorized
	}

	images, _, _, err := u.albumRepo.ListImagesByAlbum(ctx, albumID, 500, "")
	if err != nil {
		return nil, nil, fmt.Errorf("list album images: %w", err)
	}
	for _, image := range images {
		if err := u.hydrateImageURLs(ctx, image); err != nil {
			return nil, nil, err
		}
	}

	return album, images, nil
}

// DeleteImages moves images to the recycle bin. A request from the recycle bin
// itself is a permanent delete, with object deletion ordered before metadata.
func (u *AlbumUsecase) DeleteImages(ctx context.Context, albumID string, imageIDs []string) (int, time.Time, error) {
	if len(imageIDs) == 0 {
		return 0, nextMidnight(time.Now()), nil
	}
	if albumID == recycleBinAlbumID {
		deletableIDs := make([]string, 0, len(imageIDs))
		var objectErrors []error
		for _, imageID := range imageIDs {
			image, err := u.albumRepo.GetImage(ctx, imageID)
			if err != nil {
				return 0, time.Time{}, fmt.Errorf("get recycle image %s: %w", imageID, err)
			}
			if image.AlbumID != recycleBinAlbumID {
				continue
			}
			if err := u.objectStore.DeleteObject(ctx, imageObjectKey(image)); err != nil {
				objectErrors = append(objectErrors, fmt.Errorf("delete object for image %s: %w", image.ID, err))
				continue
			}
			deletableIDs = append(deletableIDs, image.ID)
		}

		if len(deletableIDs) > 0 {
			deletedImages, err := u.albumRepo.DeleteImages(ctx, albumID, deletableIDs)
			if err != nil {
				return 0, time.Time{}, fmt.Errorf("delete recycle image metadata: %w", err)
			}
			if len(objectErrors) > 0 {
				return len(deletedImages), time.Now(), fmt.Errorf("delete recycle image objects: %w", errors.Join(objectErrors...))
			}
			return len(deletedImages), time.Now(), nil
		}
		if len(objectErrors) > 0 {
			return 0, time.Time{}, fmt.Errorf("delete recycle image objects: %w", errors.Join(objectErrors...))
		}
		return 0, time.Now(), nil
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

func imageObjectKey(image *domain.Image) string {
	if image.ObjectKey != "" {
		return image.ObjectKey
	}
	// Rows created before 000002 may have no key. Their original object layout
	// is deterministic, so this fallback enables safe cleanup until the SQL
	// backfill has completed and been audited.
	return fmt.Sprintf("images/%s/%s", image.AlbumID, image.ID)
}

func (u *AlbumUsecase) hydrateImageURLs(ctx context.Context, image *domain.Image) error {
	if image.ObjectKey == "" {
		return nil // Retain the legacy URL as the compatibility read path.
	}
	url, err := u.objectStore.GetFileURL(ctx, image.ObjectKey)
	if err != nil {
		return fmt.Errorf("resolve image public URL: %w", err)
	}
	image.URL = url

	thumbnailKey := image.ThumbnailObjectKey
	if thumbnailKey == "" {
		image.ThumbnailURL = url
		return nil
	}
	thumbnailURL, err := u.objectStore.GetFileURL(ctx, thumbnailKey)
	if err != nil {
		return fmt.Errorf("resolve thumbnail public URL: %w", err)
	}
	image.ThumbnailURL = thumbnailURL
	return nil
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
