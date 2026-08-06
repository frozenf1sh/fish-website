package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/frozenfish/fish-website/internal/domain"
)

type ProjectUsecase struct {
	repo domain.ProjectRepository
	refs domain.ImageReferenceRepository
}

func NewProjectUsecase(repo domain.ProjectRepository, refs domain.ImageReferenceRepository) *ProjectUsecase {
	return &ProjectUsecase{repo: repo, refs: refs}
}

func (u *ProjectUsecase) List(ctx context.Context) ([]*domain.Project, error) {
	return u.repo.List(ctx)
}
func (u *ProjectUsecase) Get(ctx context.Context, id string) (*domain.Project, error) {
	return u.repo.Get(ctx, id)
}

func (u *ProjectUsecase) Create(ctx context.Context, title, summary, linkURL, coverImageID string) (*domain.Project, error) {
	if title == "" || coverImageID == "" {
		return nil, fmt.Errorf("project title and cover image are required")
	}
	project, err := u.repo.Create(ctx, &domain.Project{Title: title, Summary: summary, LinkURL: linkURL, CoverImageID: coverImageID, CreatedAt: time.Now()})
	if err != nil {
		return nil, err
	}
	if err := u.refs.ReplaceSourceImageIDs(ctx, "project", project.ID, []string{coverImageID}); err != nil {
		return nil, fmt.Errorf("update project image reference: %w", err)
	}
	return project, nil
}

func (u *ProjectUsecase) Update(ctx context.Context, id, title, summary, linkURL, coverImageID string) (*domain.Project, error) {
	if title == "" || coverImageID == "" {
		return nil, fmt.Errorf("project title and cover image are required")
	}
	project, err := u.repo.Update(ctx, &domain.Project{ID: id, Title: title, Summary: summary, LinkURL: linkURL, CoverImageID: coverImageID})
	if err != nil {
		return nil, err
	}
	if err := u.refs.ReplaceSourceImageIDs(ctx, "project", id, []string{coverImageID}); err != nil {
		return nil, fmt.Errorf("update project image reference: %w", err)
	}
	return project, nil
}

func (u *ProjectUsecase) Delete(ctx context.Context, id string) error {
	if err := u.repo.Delete(ctx, id); err != nil {
		return err
	}
	return u.refs.RemoveSourceReferences(ctx, "project", id)
}

func (u *ProjectUsecase) Reorder(ctx context.Context, ids []string) error {
	return u.repo.Reorder(ctx, ids)
}
