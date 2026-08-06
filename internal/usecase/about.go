package usecase

import (
	"context"
	"fmt"

	"github.com/frozenfish/fish-website/internal/domain"
)

type AboutUsecase struct {
	repo domain.AboutRepository
	refs domain.ImageReferenceRepository
}

func NewAboutUsecase(repo domain.AboutRepository, refs domain.ImageReferenceRepository) *AboutUsecase {
	return &AboutUsecase{repo: repo, refs: refs}
}
func (u *AboutUsecase) ListImages(ctx context.Context) ([]*domain.AboutImage, error) {
	return u.repo.ListImages(ctx)
}

func (u *AboutUsecase) AddImage(ctx context.Context, imageID string) (*domain.AboutImage, error) {
	if imageID == "" {
		return nil, fmt.Errorf("image id is required")
	}
	image, err := u.repo.AddImage(ctx, &domain.AboutImage{ImageID: imageID})
	if err != nil {
		return nil, err
	}
	if err := u.refreshReferences(ctx); err != nil {
		return nil, fmt.Errorf("update about image references: %w", err)
	}
	return image, nil
}

func (u *AboutUsecase) RemoveImage(ctx context.Context, id string) error {
	if err := u.repo.RemoveImage(ctx, id); err != nil {
		return err
	}
	return u.refreshReferences(ctx)
}

func (u *AboutUsecase) Reorder(ctx context.Context, ids []string) error {
	return u.repo.ReorderImages(ctx, ids)
}

func (u *AboutUsecase) refreshReferences(ctx context.Context) error {
	images, err := u.repo.ListImages(ctx)
	if err != nil {
		return err
	}
	ids := make([]string, 0, len(images))
	for _, image := range images {
		ids = append(ids, image.ImageID)
	}
	return u.refs.ReplaceSourceImageIDs(ctx, "about", "about:1", ids)
}
