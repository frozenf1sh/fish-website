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
func (u *BlogUsecase) CreateArticle(ctx context.Context, title, content, folderID string, tags []string, status string) (*domain.Article, error) {
	if status == "" {
		status = "published"
	}
	now := time.Now()
	article := &domain.Article{
		Title:     title,
		Content:   content,
		FolderID:  folderID,
		Tags:      tags,
		Status:    status,
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
func (u *BlogUsecase) ListArticles(ctx context.Context, pageSize int, pageToken, folderID, tag, status string) ([]*domain.Article, string, bool, []*domain.Folder, error) {
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	articles, nextPageToken, hasMore, err := u.blogRepo.ListArticles(ctx, pageSize, pageToken, folderID, tag, status)
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

// UpdateArticle updates an existing article
func (u *BlogUsecase) UpdateArticle(ctx context.Context, articleID, title, content, folderID string, tags []string, status string) (*domain.Article, error) {
	if status == "" {
		status = "published"
	}

	article := &domain.Article{
		ID:        articleID,
		Title:     title,
		Content:   content,
		FolderID:  folderID,
		Tags:      tags,
		Status:    status,
		UpdatedAt: time.Now(),
	}

	updatedArticle, err := u.blogRepo.UpdateArticle(ctx, article)
	if err != nil {
		return nil, fmt.Errorf("update article: %w", err)
	}

	return updatedArticle, nil
}

// DeleteArticle deletes an article
func (u *BlogUsecase) DeleteArticle(ctx context.Context, articleID string) error {
	if err := u.blogRepo.DeleteArticle(ctx, articleID); err != nil {
		return fmt.Errorf("delete article: %w", err)
	}
	return nil
}

// CreateFolder creates a new folder
func (u *BlogUsecase) CreateFolder(ctx context.Context, name, parentFolderID string) (*domain.Folder, error) {
	folder := &domain.Folder{
		Name:           name,
		ParentFolderID: parentFolderID,
	}

	created, err := u.blogRepo.CreateFolder(ctx, folder)
	if err != nil {
		return nil, fmt.Errorf("create folder: %w", err)
	}

	return created, nil
}

// UpdateFolder updates folder name or parent folder
func (u *BlogUsecase) UpdateFolder(ctx context.Context, folderID, name, parentFolderID string) (*domain.Folder, error) {
	folder := &domain.Folder{
		ID:             folderID,
		Name:           name,
		ParentFolderID: parentFolderID,
	}

	updated, err := u.blogRepo.UpdateFolder(ctx, folder)
	if err != nil {
		return nil, fmt.Errorf("update folder: %w", err)
	}

	return updated, nil
}
