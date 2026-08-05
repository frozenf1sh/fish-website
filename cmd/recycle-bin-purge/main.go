// recycle-bin-purge is a one-shot maintenance command intended for a
// Kubernetes CronJob. It deliberately has no HTTP listener and receives only
// the database and object-storage credentials it needs.
package main

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/frozenfish/fish-website/internal/repository"
	"github.com/frozenfish/fish-website/internal/usecase"
	pkgconfig "github.com/frozenfish/fish-website/pkg/config"
	"github.com/frozenfish/fish-website/pkg/logger"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	logger.Init(logger.DefaultConfig())
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
	defer cancel()

	dsn, err := requiredEnv("POSTGRES_DSN")
	if err != nil {
		logger.Error("invalid recycle-bin purge configuration", logger.Err(err))
		os.Exit(1)
	}

	storageConfig, err := loadStorageConfig()
	if err != nil {
		logger.Error("invalid recycle-bin purge configuration", logger.Err(err))
		os.Exit(1)
	}

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		logger.Error("open database pool", logger.Err(err))
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		logger.Error("ping database", logger.Err(err))
		os.Exit(1)
	}

	storage, err := repository.NewMinIOStorage(&pkgconfig.Config{MinIO: storageConfig})
	if err != nil {
		logger.Error("initialize object storage", logger.Err(err))
		os.Exit(1)
	}

	repo := repository.NewPostgresRepository(pool)
	purger := usecase.NewAlbumUsecase(repo.NewAlbumRepository(), storage.NewFileStorage(), nil)
	purged, err := purger.PurgeRecycleBin(ctx)
	if err != nil {
		logger.Error("recycle-bin purge failed", logger.Int("purged_images", purged), logger.Err(err))
		os.Exit(1)
	}

	logger.Info("recycle-bin purge completed", logger.Int("purged_images", purged))
}

func loadStorageConfig() (pkgconfig.MinIOConfig, error) {
	endpoint, err := requiredEnv("MINIO_ENDPOINT")
	if err != nil {
		return pkgconfig.MinIOConfig{}, err
	}
	accessKey, err := requiredEnv("MINIO_ACCESS_KEY")
	if err != nil {
		return pkgconfig.MinIOConfig{}, err
	}
	secretKey, err := requiredEnv("MINIO_SECRET_KEY")
	if err != nil {
		return pkgconfig.MinIOConfig{}, err
	}
	bucket, err := requiredEnv("MINIO_BUCKET")
	if err != nil {
		return pkgconfig.MinIOConfig{}, err
	}
	publicBaseURL, err := requiredEnv("MINIO_PUBLIC_BASE_URL")
	if err != nil {
		return pkgconfig.MinIOConfig{}, err
	}
	useSSL, err := strconv.ParseBool(os.Getenv("MINIO_USE_SSL"))
	if err != nil {
		return pkgconfig.MinIOConfig{}, fmt.Errorf("MINIO_USE_SSL must be a boolean: %w", err)
	}

	return pkgconfig.MinIOConfig{
		Endpoint: endpoint, AccessKey: accessKey, SecretKey: secretKey,
		Bucket: bucket, PublicBaseURL: publicBaseURL, UseSSL: useSSL,
	}, nil
}

func requiredEnv(name string) (string, error) {
	value := os.Getenv(name)
	if value == "" {
		return "", fmt.Errorf("%s is required", name)
	}
	return value, nil
}
