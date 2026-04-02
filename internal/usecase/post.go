package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/frozenfish/fish-website/internal/domain"
)

// PostUsecase handles post business logic
type PostUsecase struct {
	postRepo domain.PostRepository
}

// NewPostUsecase creates a new PostUsecase
func NewPostUsecase(postRepo domain.PostRepository) *PostUsecase {
	return &PostUsecase{postRepo: postRepo}
}

// CreatePost creates a new post
func (u *PostUsecase) CreatePost(ctx context.Context, content string, imageIDs []string) (*domain.Post, error) {
	post := &domain.Post{
		Content:   content,
		ImageURLs: make([]string, 0, len(imageIDs)),
		CreatedAt: time.Now(),
	}

	// TODO: In a real implementation, we would look up the image URLs from the image IDs
	// For now, we'll just leave ImageURLs empty

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
