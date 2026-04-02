package repository

import (
	"context"
	"fmt"
	"net/url"
	"time"

	pkgconfig "github.com/frozenfish/fish-website/pkg/config"
	"github.com/frozenfish/fish-website/pkg/logger"
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
func NewMinIOStorage(cfg *pkgconfig.Config) (*MinIOStorage, error) {
	logger.Info("initializing MinIO storage",
		logger.String("endpoint", cfg.MinIO.Endpoint),
		logger.String("bucket", cfg.MinIO.Bucket),
		logger.Bool("use_ssl", cfg.MinIO.UseSSL))

	client, err := minio.New(cfg.MinIO.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinIO.AccessKey, cfg.MinIO.SecretKey, ""),
		Secure: cfg.MinIO.UseSSL,
	})
	if err != nil {
		logger.Error("failed to create MinIO client", logger.Err(err))
		return nil, fmt.Errorf("create minio client: %w", err)
	}

	// Ensure bucket exists
	ctx := context.Background()
	logger.Debug("checking if bucket exists", logger.String("bucket", cfg.MinIO.Bucket))
	exists, err := client.BucketExists(ctx, cfg.MinIO.Bucket)
	if err != nil {
		logger.Error("failed to check bucket existence", logger.Err(err))
		return nil, fmt.Errorf("check bucket exists: %w", err)
	}
	if !exists {
		logger.Info("bucket does not exist, creating", logger.String("bucket", cfg.MinIO.Bucket))
		err = client.MakeBucket(ctx, cfg.MinIO.Bucket, minio.MakeBucketOptions{})
		if err != nil {
			logger.Error("failed to create bucket", logger.Err(err))
			return nil, fmt.Errorf("create bucket: %w", err)
		}
	}

	// Set bucket policy to allow public read
	logger.Debug("setting bucket public read policy", logger.String("bucket", cfg.MinIO.Bucket))
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
	}`, cfg.MinIO.Bucket)

	if err := client.SetBucketPolicy(ctx, cfg.MinIO.Bucket, publicReadPolicy); err != nil {
		logger.Error("failed to set bucket policy", logger.Err(err))
		return nil, fmt.Errorf("set bucket policy: %w", err)
	}

	logger.Info("MinIO storage initialized successfully", logger.String("bucket", cfg.MinIO.Bucket))
	return &MinIOStorage{
		client:      client,
		bucketName:  cfg.MinIO.Bucket,
		endpoint:    cfg.MinIO.Endpoint,
		useSSL:      cfg.MinIO.UseSSL,
	}, nil
}

// NewFileStorage returns a FileStorage implementation
func (s *MinIOStorage) NewFileStorage() domain.FileStorage {
	return (*minioFileStorage)(s)
}

// minioFileStorage implements FileStorage
type minioFileStorage MinIOStorage

func (s *minioFileStorage) GetPresignedUploadURL(ctx context.Context, objectName string, contentType string, fileSize int64, expires time.Duration) (uploadURL string, headers map[string]string, err error) {
	logger.Debug("generating presigned upload URL",
		logger.String("object_name", objectName),
		logger.String("content_type", contentType),
		logger.Int64("file_size", fileSize),
		logger.String("expires", expires.String()))

	reqParams := make(url.Values)
	reqParams.Set("Content-Type", contentType)

	presignedURL, err := s.client.PresignedPutObject(ctx, s.bucketName, objectName, expires)
	if err != nil {
		logger.Error("failed to generate presigned URL", logger.Err(err))
		return "", nil, fmt.Errorf("presign put object: %w", err)
	}

	headers = map[string]string{
		"Content-Type": contentType,
	}

	logger.Debug("presigned upload URL generated successfully", logger.String("object_name", objectName))
	return presignedURL.String(), headers, nil
}

func (s *minioFileStorage) GetFileURL(ctx context.Context, objectName string) (string, error) {
	// Return public URL since bucket is publicly readable
	scheme := "http"
	if s.useSSL {
		scheme = "https"
	}
	url := fmt.Sprintf("%s://%s/%s/%s", scheme, s.endpoint, s.bucketName, objectName)
	logger.Debug("generated file URL", logger.String("object_name", objectName), logger.String("url", url))
	return url, nil
}

func (s *minioFileStorage) IsObjectExists(ctx context.Context, objectName string) (bool, error) {
	logger.Debug("checking if object exists", logger.String("object_name", objectName))
	_, err := s.client.StatObject(ctx, s.bucketName, objectName, minio.StatObjectOptions{})
	if err != nil {
		if minio.ToErrorResponse(err).Code == "NoSuchKey" {
			logger.Debug("object does not exist", logger.String("object_name", objectName))
			return false, nil
		}
		logger.Error("failed to stat object", logger.Err(err))
		return false, fmt.Errorf("stat object: %w", err)
	}
	logger.Debug("object exists", logger.String("object_name", objectName))
	return true, nil
}
