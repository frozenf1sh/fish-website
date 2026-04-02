package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/frozenfish/fish-website/internal/domain"
)

// BlogUsecase handles blog business logic
type BlogUsecase struct {
	blogRepo domain.BlogRepository
}

// NewBlogUsecase creates a new BlogUsecase
func NewBlogUsecase(blogRepo domain.BlogRepository) *BlogUsecase {
	return &BlogUsecase{blogRepo: blogRepo}
}

// CreateArticle creates a new article
func (u *BlogUsecase) CreateArticle(ctx context.Context, title, content, folderID string, tags []string) (*domain.Article, error) {
	now := time.Now()
	article := &domain.Article{
		Title:     title,
		Content:   content,
		FolderID:  folderID,
		Tags:      tags,
		CreatedAt: now,
		UpdatedAt: now,
	}

	createdArticle, err := u.blogRepo.CreateArticle(ctx, article)
	if err != nil {
		return nil, fmt.Errorf("create article: %w", err)
	}

	return createdArticle, nil
}

// ListArticles lists articles with pagination and filters
func (u *BlogUsecase) ListArticles(ctx context.Context, pageSize int, pageToken, folderID, tag string) ([]*domain.Article, string, bool, []*domain.Folder, error) {
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	articles, nextPageToken, hasMore, err := u.blogRepo.ListArticles(ctx, pageSize, pageToken, folderID, tag)
	if err != nil {
		return nil, "", false, nil, fmt.Errorf("list articles: %w", err)
	}

	folders, err := u.blogRepo.GetFolders(ctx)
	if err != nil {
		return nil, "", false, nil, fmt.Errorf("get folders: %w", err)
	}

	return articles, nextPageToken, hasMore, folders, nil
}

// GetArticle gets a single article by ID
func (u *BlogUsecase) GetArticle(ctx context.Context, articleID string) (*domain.Article, error) {
	article, err := u.blogRepo.GetArticle(ctx, articleID)
	if err != nil {
		return nil, fmt.Errorf("get article: %w", err)
	}
	return article, nil
}
