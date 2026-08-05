package repository

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/frozenfish/fish-website/internal/domain"
	pkgconfig "github.com/frozenfish/fish-website/pkg/config"
	"github.com/frozenfish/fish-website/pkg/logger"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// R2ObjectStore is the Cloudflare R2 implementation of the media ObjectStore
// port. The MinIO Go SDK is used solely as an S3 protocol client; no MinIO
// lifecycle or bucket-policy operation belongs in an application process.
type R2ObjectStore struct {
	client        *minio.Client
	bucketName    string
	publicBaseURL string
}

// NewR2ObjectStore creates a provider adapter. Bucket creation, public domain
// binding and CORS are platform responsibilities and are intentionally absent.
func NewR2ObjectStore(cfg pkgconfig.R2Config) (*R2ObjectStore, error) {
	endpoint := strings.TrimPrefix(strings.TrimPrefix(cfg.Endpoint, "https://"), "http://")
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKeyID, cfg.SecretAccessKey, ""),
		Secure: cfg.UseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("create R2 S3 client: %w", err)
	}

	return &R2ObjectStore{
		client:        client,
		bucketName:    cfg.Bucket,
		publicBaseURL: cfg.PublicBaseURL,
	}, nil
}

// ObjectStore returns the dependency through the media domain's port.
func (s *R2ObjectStore) ObjectStore() domain.ObjectStore {
	return s
}

func (s *R2ObjectStore) GetPresignedUploadURL(ctx context.Context, objectName string, contentType string, fileSize int64, expires time.Duration) (uploadURL string, headers map[string]string, err error) {
	// S3 presigned PUT can bind the object key and content type, but not a
	// portable Content-Length constraint. The media application layer enforces
	// its size policy before issuing a grant and the next media phase verifies
	// object metadata during confirmation.
	_ = fileSize
	reqParams := make(url.Values)
	reqParams.Set("Content-Type", contentType)

	presignedURL, err := s.client.Presign(ctx, http.MethodPut, s.bucketName, objectName, expires, reqParams)
	if err != nil {
		return "", nil, fmt.Errorf("presign R2 put object: %w", err)
	}

	return presignedURL.String(), map[string]string{"Content-Type": contentType}, nil
}

func (s *R2ObjectStore) GetFileURL(_ context.Context, objectName string) (string, error) {
	return fmt.Sprintf("%s/%s", strings.TrimRight(s.publicBaseURL, "/"), strings.TrimLeft(objectName, "/")), nil
}

func (s *R2ObjectStore) IsObjectExists(ctx context.Context, objectName string) (bool, error) {
	_, err := s.client.StatObject(ctx, s.bucketName, objectName, minio.StatObjectOptions{})
	if err != nil {
		if minio.ToErrorResponse(err).Code == "NoSuchKey" {
			return false, nil
		}
		return false, fmt.Errorf("stat R2 object: %w", err)
	}
	return true, nil
}

func (s *R2ObjectStore) DeleteObject(ctx context.Context, objectName string) error {
	err := s.client.RemoveObject(ctx, s.bucketName, objectName, minio.RemoveObjectOptions{})
	if err != nil {
		if minio.ToErrorResponse(err).Code == "NoSuchKey" {
			return nil
		}
		return fmt.Errorf("remove R2 object: %w", err)
	}
	logger.Debug("R2 object deleted", logger.String("object_name", objectName))
	return nil
}
