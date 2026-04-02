package repository

import (
	"context"
	"fmt"
	"net/url"
	"time"

	"github.com/frozenfish/fish-website/internal/config"
	"github.com/frozenfish/fish-website/internal/domain"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// MinIOStorage implements FileStorage interface
type MinIOStorage struct {
	client      *minio.Client
	bucketName  string
	endpoint    string
	useSSL      bool
}

// NewMinIOStorage creates a new MinIOStorage
func NewMinIOStorage(cfg *config.Config) (*MinIOStorage, error) {
	client, err := minio.New(cfg.MinIOEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinIOAccessKey, cfg.MinIOSecretKey, ""),
		Secure: cfg.MinIOUseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("create minio client: %w", err)
	}

	// Ensure bucket exists
	ctx := context.Background()
	exists, err := client.BucketExists(ctx, cfg.MinIOBucketName)
	if err != nil {
		return nil, fmt.Errorf("check bucket exists: %w", err)
	}
	if !exists {
		err = client.MakeBucket(ctx, cfg.MinIOBucketName, minio.MakeBucketOptions{})
		if err != nil {
			return nil, fmt.Errorf("create bucket: %w", err)
		}
	}

	// Set bucket policy to allow public read
	publicReadPolicy := fmt.Sprintf(`{
		"Version": "2012-10-17",
		"Statement": [
			{
				"Sid": "PublicRead",
				"Effect": "Allow",
				"Principal": "*",
				"Action": ["s3:GetObject"],
				"Resource": ["arn:aws:s3:::%s/*"]
			}
		]
	}`, cfg.MinIOBucketName)

	if err := client.SetBucketPolicy(ctx, cfg.MinIOBucketName, publicReadPolicy); err != nil {
		return nil, fmt.Errorf("set bucket policy: %w", err)
	}

	return &MinIOStorage{
		client:      client,
		bucketName:  cfg.MinIOBucketName,
		endpoint:    cfg.MinIOEndpoint,
		useSSL:      cfg.MinIOUseSSL,
	}, nil
}

// NewFileStorage returns a FileStorage implementation
func (s *MinIOStorage) NewFileStorage() domain.FileStorage {
	return (*minioFileStorage)(s)
}

// minioFileStorage implements FileStorage
type minioFileStorage MinIOStorage

func (s *minioFileStorage) GetPresignedUploadURL(ctx context.Context, objectName string, contentType string, fileSize int64, expires time.Duration) (uploadURL string, headers map[string]string, err error) {
	reqParams := make(url.Values)
	reqParams.Set("Content-Type", contentType)

	presignedURL, err := s.client.PresignedPutObject(ctx, s.bucketName, objectName, expires)
	if err != nil {
		return "", nil, fmt.Errorf("presign put object: %w", err)
	}

	headers = map[string]string{
		"Content-Type": contentType,
	}

	return presignedURL.String(), headers, nil
}

func (s *minioFileStorage) GetFileURL(ctx context.Context, objectName string) (string, error) {
	// Return public URL since bucket is publicly readable
	scheme := "http"
	if s.useSSL {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s/%s/%s", scheme, s.endpoint, s.bucketName, objectName), nil
}

func (s *minioFileStorage) IsObjectExists(ctx context.Context, objectName string) (bool, error) {
	_, err := s.client.StatObject(ctx, s.bucketName, objectName, minio.StatObjectOptions{})
	if err != nil {
		if minio.ToErrorResponse(err).Code == "NoSuchKey" {
			return false, nil
		}
		return false, fmt.Errorf("stat object: %w", err)
	}
	return true, nil
}
