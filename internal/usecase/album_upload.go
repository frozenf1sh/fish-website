package usecase

import (
	"context"
	"fmt"
	"mime"
	"strings"
	"time"

	"github.com/frozenfish/fish-website/internal/domain"
	"github.com/rs/xid"
)

const maxImageUploadBytes int64 = 25 * 1024 * 1024

var allowedImageMIMETypes = map[string]struct{}{
	"image/jpeg": {}, "image/png": {}, "image/webp": {}, "image/avif": {},
}

// GetPresignedUploadURL creates a pending media record and issues a short-lived
// object-store upload grant for its immutable object key.
func (u *AlbumUsecase) GetPresignedUploadURL(ctx context.Context, albumID, fileName, mimeType string, fileSize int64) (uploadURL string, imageID string, headers map[string]string, expiresAt time.Time, err error) {
	if err := validateImageUpload(fileName, mimeType, fileSize); err != nil {
		return "", "", nil, time.Time{}, err
	}
	if _, err = u.albumRepo.GetAlbum(ctx, albumID); err != nil {
		if albumID != defaultAlbumID {
			return "", "", nil, time.Time{}, fmt.Errorf("get album: %w", err)
		}
		if _, err = u.albumRepo.CreateAlbum(ctx, &domain.Album{
			ID:          defaultAlbumID,
			Name:        "默认相册",
			Description: "系统默认创建的相册",
			IsPublic:    false,
			CreatedAt:   time.Now(),
		}); err != nil {
			return "", "", nil, time.Time{}, fmt.Errorf("create default album: %w", err)
		}
	}

	imageID = xid.New().String()
	objectName := fmt.Sprintf("images/%s/%s", albumID, imageID)
	expiresAt = time.Now().Add(time.Hour)

	uploadURL, headers, err = u.objectStore.GetPresignedUploadURL(ctx, objectName, mimeType, fileSize, time.Until(expiresAt))
	if err != nil {
		return "", "", nil, time.Time{}, fmt.Errorf("get presigned url: %w", err)
	}

	if _, err = u.albumRepo.CreateImage(ctx, &domain.Image{
		ID:        imageID,
		AlbumID:   albumID,
		ObjectKey: objectName,
		FileName:  fileName,
		FileSize:  fileSize,
		MimeType:  mimeType,
		CreatedAt: time.Now(),
	}); err != nil {
		return "", "", nil, time.Time{}, fmt.Errorf("create image record: %w", err)
	}

	return uploadURL, imageID, headers, expiresAt, nil
}

// ConfirmImageUpload verifies the object that was uploaded through a grant.
func (u *AlbumUsecase) ConfirmImageUpload(ctx context.Context, imageID, uploadURL string) (*domain.Image, error) {
	// The field is retained in the wire contract during client migration. The
	// server binds confirmation to the persisted image ID and object key instead
	// of accepting a caller-controlled URL.
	_ = uploadURL
	image, err := u.albumRepo.GetImage(ctx, imageID)
	if err != nil {
		return nil, fmt.Errorf("get image: %w", err)
	}

	objectName := imageObjectKey(image)
	metadata, err := u.objectStore.HeadObject(ctx, objectName)
	if err != nil {
		if !u.isObjectNotFound(ctx, objectName, err) {
			return nil, fmt.Errorf("inspect uploaded object: %w", err)
		}
		return nil, domain.ErrImageNotUploaded
	}
	if metadata.Size != image.FileSize || !sameMediaType(metadata.ContentType, image.MimeType) {
		return nil, domain.ErrImageUploadMismatch
	}

	image.ObjectKey = objectName
	if err := u.hydrateImageURLs(ctx, image); err != nil {
		return nil, err
	}
	updatedImage, err := u.albumRepo.UpdateImage(ctx, image)
	if err != nil {
		return nil, fmt.Errorf("update image: %w", err)
	}

	return updatedImage, nil
}

func (u *AlbumUsecase) isObjectNotFound(ctx context.Context, objectName string, headErr error) bool {
	exists, err := u.objectStore.IsObjectExists(ctx, objectName)
	return err == nil && !exists && headErr != nil
}

func validateImageUpload(fileName, contentType string, fileSize int64) error {
	if strings.TrimSpace(fileName) == "" || len(fileName) > 255 || fileSize <= 0 || fileSize > maxImageUploadBytes {
		return domain.ErrInvalidImageUpload
	}
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return domain.ErrInvalidImageUpload
	}
	if _, ok := allowedImageMIMETypes[strings.ToLower(mediaType)]; !ok {
		return domain.ErrInvalidImageUpload
	}
	return nil
}

func sameMediaType(actual, expected string) bool {
	actualType, _, actualErr := mime.ParseMediaType(actual)
	expectedType, _, expectedErr := mime.ParseMediaType(expected)
	return actualErr == nil && expectedErr == nil && strings.EqualFold(actualType, expectedType)
}
