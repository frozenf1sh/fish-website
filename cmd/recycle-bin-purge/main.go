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

	r2Config, err := loadR2Config()
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

	storage, err := repository.NewR2ObjectStore(r2Config)
	if err != nil {
		logger.Error("initialize object storage", logger.Err(err))
		os.Exit(1)
	}

	repo := repository.NewPostgresRepository(pool)
	purger := usecase.NewAlbumUsecase(repo.NewAlbumRepository(), storage.ObjectStore(), nil)
	purged, err := purger.PurgeRecycleBin(ctx)
	if err != nil {
		logger.Error("recycle-bin purge failed", logger.Int("purged_images", purged), logger.Err(err))
		os.Exit(1)
	}

	logger.Info("recycle-bin purge completed", logger.Int("purged_images", purged))
}

func loadR2Config() (pkgconfig.R2Config, error) {
	endpoint, err := requiredEnv("R2_ENDPOINT")
	if err != nil {
		return pkgconfig.R2Config{}, err
	}
	accessKeyID, err := requiredEnv("R2_ACCESS_KEY_ID")
	if err != nil {
		return pkgconfig.R2Config{}, err
	}
	secretAccessKey, err := requiredEnv("R2_SECRET_ACCESS_KEY")
	if err != nil {
		return pkgconfig.R2Config{}, err
	}
	bucket, err := requiredEnv("R2_BUCKET")
	if err != nil {
		return pkgconfig.R2Config{}, err
	}
	publicBaseURL, err := requiredEnv("R2_PUBLIC_BASE_URL")
	if err != nil {
		return pkgconfig.R2Config{}, err
	}
	useSSL, err := strconv.ParseBool(os.Getenv("R2_USE_SSL"))
	if err != nil {
		return pkgconfig.R2Config{}, fmt.Errorf("R2_USE_SSL must be a boolean: %w", err)
	}

	return pkgconfig.R2Config{
		Endpoint: endpoint, AccessKeyID: accessKeyID, SecretAccessKey: secretAccessKey,
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
