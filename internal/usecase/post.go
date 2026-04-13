package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/frozenfish/fish-website/internal/domain"
)

// PostUsecase handles post business logic
type PostUsecase struct {
	postRepo     domain.PostRepository
	albumRepo    domain.AlbumRepository
	imageRefRepo domain.ImageReferenceRepository
}

// NewPostUsecase creates a new PostUsecase
func NewPostUsecase(postRepo domain.PostRepository, albumRepo domain.AlbumRepository, imageRefRepo domain.ImageReferenceRepository) *PostUsecase {
	return &PostUsecase{
		postRepo:     postRepo,
		albumRepo:    albumRepo,
		imageRefRepo: imageRefRepo,
	}
}

// CreatePost creates a new post
func (u *PostUsecase) CreatePost(ctx context.Context, content string, imageIDs []string) (*domain.Post, error) {
	imageURLs := make([]string, 0, len(imageIDs))
	for _, id := range imageIDs {
		img, err := u.albumRepo.GetImage(ctx, id)
		if err != nil {
			// Alternatively, log the error and continue, but we'll return an error here
			return nil, fmt.Errorf("failed to get image %s: %w", id, err)
		}
		if img.URL != "" {
			imageURLs = append(imageURLs, img.URL)
		}
	}

	post := &domain.Post{
		Content:   content,
		ImageURLs: imageURLs,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	createdPost, err := u.postRepo.Create(ctx, post)
	if err != nil {
		return nil, fmt.Errorf("create post: %w", err)
	}
	if err := u.imageRefRepo.AdjustByURLs(ctx, imageURLs, "post", 1); err != nil {
		return nil, fmt.Errorf("update post image references: %w", err)
	}

	return createdPost, nil
}

// ListPosts lists posts with pagination
func (u *PostUsecase) ListPosts(ctx context.Context, pageSize int, pageToken string) ([]*domain.Post, string, bool, error) {
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	posts, nextPageToken, hasMore, err := u.postRepo.List(ctx, pageSize, pageToken)
	if err != nil {
		return nil, "", false, fmt.Errorf("list posts: %w", err)
	}

	return posts, nextPageToken, hasMore, nil
}

// GetPost gets one post by id
func (u *PostUsecase) GetPost(ctx context.Context, id string) (*domain.Post, error) {
	post, err := u.postRepo.Get(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get post: %w", err)
	}
	return post, nil
}

// UpdatePost updates post content and image urls
func (u *PostUsecase) UpdatePost(ctx context.Context, id, content string, imageURLs []string) (*domain.Post, error) {
	existing, err := u.postRepo.Get(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get existing post: %w", err)
	}

	post := &domain.Post{
		ID:        id,
		Content:   content,
		ImageURLs: imageURLs,
		CreatedAt: existing.CreatedAt,
		UpdatedAt: time.Now(),
	}

	updated, err := u.postRepo.Update(ctx, post)
	if err != nil {
		return nil, fmt.Errorf("update post: %w", err)
	}

	added, removed := diffURLCounts(existing.ImageURLs, imageURLs)
	if len(added) > 0 {
		if err := u.imageRefRepo.AdjustByURLs(ctx, added, "post", 1); err != nil {
			return nil, fmt.Errorf("increment post image references: %w", err)
		}
	}
	if len(removed) > 0 {
		if err := u.imageRefRepo.AdjustByURLs(ctx, removed, "post", -1); err != nil {
			return nil, fmt.Errorf("decrement post image references: %w", err)
		}
	}

	return updated, nil
}

// DeletePost deletes a post by ID
func (u *PostUsecase) DeletePost(ctx context.Context, id string) error {
	existing, err := u.postRepo.Get(ctx, id)
	if err != nil {
		return fmt.Errorf("get existing post: %w", err)
	}
	if err := u.postRepo.Delete(ctx, id); err != nil {
		return fmt.Errorf("delete post: %w", err)
	}
	if err := u.imageRefRepo.AdjustByURLs(ctx, existing.ImageURLs, "post", -1); err != nil {
		return fmt.Errorf("decrement post image references: %w", err)
	}
	return nil
}
