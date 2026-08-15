//go:build wireinject
// +build wireinject

package main

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"github.com/frozenfish/fish-website/internal/delivery"
	"github.com/frozenfish/fish-website/internal/domain"
	githubclient "github.com/frozenfish/fish-website/internal/github"
	identityapplication "github.com/frozenfish/fish-website/internal/identity/application"
	"github.com/frozenfish/fish-website/internal/middleware"
	"github.com/frozenfish/fish-website/internal/repository"
	"github.com/frozenfish/fish-website/internal/usecase"
	pkgconfig "github.com/frozenfish/fish-website/pkg/config"
	"github.com/google/wire"
	"github.com/jackc/pgx/v5/pgxpool"
)

func InitializeServer(ctx context.Context, cfg *pkgconfig.Config) (*Server, error) {
	wire.Build(
		providePGXPool,
		providePostgresRepository,
		providePostRepository,
		provideBlogRepository,
		provideAlbumRepository,
		provideImageReferenceRepository,
		provideSettingsRepository,
		provideProjectRepository,
		provideAboutRepository,
		provideR2ObjectStore,
		provideObjectStore,
		provideOwnerAuthenticator,
		providePostUsecase,
		provideBlogUsecase,
		provideAlbumUsecase,
		provideSettingsUsecase,
		provideProjectUsecase,
		provideAboutUsecase,
		provideGitHubUsecase,
		provideHandler,
		provideAuthInterceptor,
		NewServer,
	)
	return &Server{}, nil
}

func provideGitHubUsecase(cfg *pkgconfig.Config) *usecase.GitHubUsecase {
	return usecase.NewGitHubUsecase(githubclient.NewClient(cfg.GitHub.Username, cfg.GitHub.Token), time.Duration(cfg.GitHub.CacheTTLSeconds)*time.Second)
}

func providePGXPool(ctx context.Context, cfg *pkgconfig.Config) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, cfg.Database.DSN)
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

func provideProjectRepository(repo *repository.PostgresRepository) domain.ProjectRepository {
	return repo.NewProjectRepository()
}
func provideAboutRepository(repo *repository.PostgresRepository) domain.AboutRepository {
	return repo.NewAboutRepository()
}

func provideImageReferenceRepository(repo *repository.PostgresRepository) domain.ImageReferenceRepository {
	return repo.NewImageReferenceRepository()
}

func provideR2ObjectStore(cfg *pkgconfig.Config) (*repository.R2ObjectStore, error) {
	return repository.NewR2ObjectStore(cfg.Storage.R2)
}

func provideObjectStore(storage *repository.R2ObjectStore) domain.ObjectStore {
	return storage.ObjectStore()
}

func provideOwnerAuthenticator(cfg *pkgconfig.Config) *identityapplication.OwnerAuthenticator {
	return identityapplication.NewOwnerAuthenticator(
		cfg.Auth.OwnerUsername,
		cfg.Auth.AdminPasswordHash,
		cfg.Auth.JWTSecret,
		time.Duration(cfg.Auth.TokenTTLSeconds)*time.Second,
	)
}

func providePostUsecase(repo domain.PostRepository, albumRepo domain.AlbumRepository, imageRefRepo domain.ImageReferenceRepository) *usecase.PostUsecase {
	return usecase.NewPostUsecase(repo, albumRepo, imageRefRepo)
}

func provideBlogUsecase(repo domain.BlogRepository, imageRefRepo domain.ImageReferenceRepository) *usecase.BlogUsecase {
	return usecase.NewBlogUsecase(repo, imageRefRepo)
}

func provideAlbumUsecase(albumRepo domain.AlbumRepository, objectStore domain.ObjectStore, imageRefRepo domain.ImageReferenceRepository) *usecase.AlbumUsecase {
	return usecase.NewAlbumUsecase(albumRepo, objectStore, imageRefRepo)
}

func provideSettingsUsecase(repo domain.SettingsRepository, imageRefRepo domain.ImageReferenceRepository) *usecase.SettingsUsecase {
	return usecase.NewSettingsUsecase(repo, imageRefRepo)
}

func provideProjectUsecase(repo domain.ProjectRepository, refs domain.ImageReferenceRepository) *usecase.ProjectUsecase {
	return usecase.NewProjectUsecase(repo, refs)
}
func provideAboutUsecase(repo domain.AboutRepository, refs domain.ImageReferenceRepository) *usecase.AboutUsecase {
	return usecase.NewAboutUsecase(repo, refs)
}

func provideHandler(
	authenticator *identityapplication.OwnerAuthenticator,
	postUsecase *usecase.PostUsecase,
	blogUsecase *usecase.BlogUsecase,
	albumUsecase *usecase.AlbumUsecase,
	settingsUsecase *usecase.SettingsUsecase,
	projectUsecase *usecase.ProjectUsecase,
	aboutUsecase *usecase.AboutUsecase,
	githubUsecase *usecase.GitHubUsecase,
) *delivery.Handler {
	return delivery.NewHandler(authenticator, postUsecase, blogUsecase, albumUsecase, settingsUsecase, projectUsecase, aboutUsecase, githubUsecase)
}

func provideAuthInterceptor(authenticator *identityapplication.OwnerAuthenticator) connect.Interceptor {
	return middleware.NewAuthRequiredInterceptor(authenticator)
}
