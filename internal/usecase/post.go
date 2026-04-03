package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/frozenfish/fish-website/internal/domain"
)

// PostUsecase handles post business logic
type PostUsecase struct {
	postRepo  domain.PostRepository
	albumRepo domain.AlbumRepository
}

// NewPostUsecase creates a new PostUsecase
func NewPostUsecase(postRepo domain.PostRepository, albumRepo domain.AlbumRepository) *PostUsecase {
	return &PostUsecase{
		postRepo:  postRepo,
		albumRepo: albumRepo,
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
	}

	createdPost, err := u.postRepo.Create(ctx, post)
	if err != nil {
		return nil, fmt.Errorf("create post: %w", err)
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
