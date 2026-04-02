//go:build wireinject
// +build wireinject

package main

import (
	"context"

	"connectrpc.com/connect"
	"github.com/frozenfish/fish-website/internal/config"
	"github.com/frozenfish/fish-website/internal/delivery"
	"github.com/frozenfish/fish-website/internal/domain"
	"github.com/frozenfish/fish-website/internal/middleware"
	"github.com/frozenfish/fish-website/internal/repository"
	"github.com/frozenfish/fish-website/internal/usecase"
	"github.com/google/wire"
	"github.com/jackc/pgx/v5/pgxpool"
)

func InitializeServer(ctx context.Context, cfg *config.Config) (*Server, error) {
	wire.Build(
		providePGXPool,
		providePostgresRepository,
		providePostRepository,
		provideBlogRepository,
		provideAlbumRepository,
		provideSettingsRepository,
		provideMinIOStorage,
		provideFileStorage,
		provideAuthUsecase,
		providePostUsecase,
		provideBlogUsecase,
		provideAlbumUsecase,
		provideSettingsUsecase,
		provideHandler,
		provideAuthInterceptor,
		NewServer,
	)
	return &Server{}, nil
}

func providePGXPool(ctx context.Context, cfg *config.Config) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, cfg.PostgresDSN)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, err
	}
	return pool, nil
}

func providePostgresRepository(pool *pgxpool.Pool) *repository.PostgresRepository {
	return repository.NewPostgresRepository(pool)
}

func providePostRepository(repo *repository.PostgresRepository) domain.PostRepository {
	return repo.NewPostRepository()
}

func provideBlogRepository(repo *repository.PostgresRepository) domain.BlogRepository {
	return repo.NewBlogRepository()
}

func provideAlbumRepository(repo *repository.PostgresRepository) domain.AlbumRepository {
	return repo.NewAlbumRepository()
}

func provideSettingsRepository(repo *repository.PostgresRepository) domain.SettingsRepository {
	return repo.NewSettingsRepository()
}

func provideMinIOStorage(cfg *config.Config) (*repository.MinIOStorage, error) {
	return repository.NewMinIOStorage(cfg)
}

func provideFileStorage(storage *repository.MinIOStorage) domain.FileStorage {
	return storage.NewFileStorage()
}

func provideAuthUsecase(cfg *config.Config) *usecase.AuthUsecase {
	return usecase.NewAuthUsecase(cfg)
}

func providePostUsecase(repo domain.PostRepository) *usecase.PostUsecase {
	return usecase.NewPostUsecase(repo)
}

func provideBlogUsecase(repo domain.BlogRepository) *usecase.BlogUsecase {
	return usecase.NewBlogUsecase(repo)
}

func provideAlbumUsecase(albumRepo domain.AlbumRepository, fileStorage domain.FileStorage) *usecase.AlbumUsecase {
	return usecase.NewAlbumUsecase(albumRepo, fileStorage)
}

func provideSettingsUsecase(repo domain.SettingsRepository) *usecase.SettingsUsecase {
	return usecase.NewSettingsUsecase(repo)
}

func provideHandler(
	authUsecase *usecase.AuthUsecase,
	postUsecase *usecase.PostUsecase,
	blogUsecase *usecase.BlogUsecase,
	albumUsecase *usecase.AlbumUsecase,
	settingsUsecase *usecase.SettingsUsecase,
) *delivery.Handler {
	return delivery.NewHandler(authUsecase, postUsecase, blogUsecase, albumUsecase, settingsUsecase)
}

func provideAuthInterceptor(authUsecase *usecase.AuthUsecase) connect.Interceptor {
	return middleware.NewAuthRequiredInterceptor(authUsecase)
}
