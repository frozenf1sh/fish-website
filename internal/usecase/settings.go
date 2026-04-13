package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/frozenfish/fish-website/internal/domain"
)

// SettingsUsecase handles settings business logic
type SettingsUsecase struct {
	settingsRepo domain.SettingsRepository
	imageRefRepo domain.ImageReferenceRepository
}

// NewSettingsUsecase creates a new SettingsUsecase
func NewSettingsUsecase(settingsRepo domain.SettingsRepository, imageRefRepo domain.ImageReferenceRepository) *SettingsUsecase {
	return &SettingsUsecase{settingsRepo: settingsRepo, imageRefRepo: imageRefRepo}
}

// GetSettings gets the current settings
func (u *SettingsUsecase) GetSettings(ctx context.Context) (*domain.Settings, error) {
	settings, err := u.settingsRepo.Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("get settings: %w", err)
	}
	return settings, nil
}

// UpdateSettings updates settings with field mask support
func (u *SettingsUsecase) UpdateSettings(ctx context.Context, settings *domain.Settings, updateMask []string) (*domain.Settings, error) {
	// Get current settings first
	current, err := u.settingsRepo.Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("get current settings: %w", err)
	}

	// Apply updates based on field mask
	fieldSet := make(map[string]bool)
	for _, field := range updateMask {
		// support both camelCase and snake_case
		fieldSet[field] = true
	}

	// If no mask provided, update all fields
	updateAll := len(updateMask) == 0
	oldAvatarURL := current.AvatarURL
	oldBackgroundURL := current.BackgroundImageURL
	oldFaviconURL := extractCustomLinkURL(current.CustomLinks, "siteFaviconUrl")

	if updateAll || fieldSet["display_name"] || fieldSet["displayName"] {
		current.DisplayName = settings.DisplayName
	}
	if updateAll || fieldSet["bio"] {
		current.Bio = settings.Bio
	}
	if updateAll || fieldSet["avatar_url"] || fieldSet["avatarUrl"] {
		current.AvatarURL = settings.AvatarURL
	}
	if updateAll || fieldSet["twitter_url"] || fieldSet["twitterUrl"] {
		current.TwitterURL = settings.TwitterURL
	}
	if updateAll || fieldSet["github_url"] || fieldSet["githubUrl"] {
		current.GitHubURL = settings.GitHubURL
	}
	if updateAll || fieldSet["bilibili_url"] || fieldSet["bilibiliUrl"] {
		current.BilibiliURL = settings.BilibiliURL
	}
	if updateAll || fieldSet["custom_links"] || fieldSet["customLinks"] {
		current.CustomLinks = settings.CustomLinks
	}
	if updateAll || fieldSet["background_image_url"] || fieldSet["backgroundImageUrl"] {
		current.BackgroundImageURL = settings.BackgroundImageURL
	}
	if updateAll || fieldSet["sakura_particles_enabled"] || fieldSet["sakuraParticlesEnabled"] {
		current.SakuraParticlesEnabled = settings.SakuraParticlesEnabled
	}
	if updateAll || fieldSet["theme_color"] || fieldSet["themeColor"] {
		current.ThemeColor = settings.ThemeColor
	}

	current.UpdatedAt = time.Now()

	updated, err := u.settingsRepo.Update(ctx, current)
	if err != nil {
		return nil, fmt.Errorf("update settings: %w", err)
	}

	if oldAvatarURL != current.AvatarURL {
		if oldAvatarURL != "" {
			if err := u.imageRefRepo.AdjustByURLs(ctx, []string{oldAvatarURL}, "avatar", -1); err != nil {
				return nil, fmt.Errorf("decrement avatar reference: %w", err)
			}
		}
		if current.AvatarURL != "" {
			if err := u.imageRefRepo.AdjustByURLs(ctx, []string{current.AvatarURL}, "avatar", 1); err != nil {
				return nil, fmt.Errorf("increment avatar reference: %w", err)
			}
		}
	}

	if oldBackgroundURL != current.BackgroundImageURL {
		if oldBackgroundURL != "" {
			if err := u.imageRefRepo.AdjustByURLs(ctx, []string{oldBackgroundURL}, "background", -1); err != nil {
				return nil, fmt.Errorf("decrement background reference: %w", err)
			}
		}
		if current.BackgroundImageURL != "" {
			if err := u.imageRefRepo.AdjustByURLs(ctx, []string{current.BackgroundImageURL}, "background", 1); err != nil {
				return nil, fmt.Errorf("increment background reference: %w", err)
			}
		}
	}

	newFaviconURL := extractCustomLinkURL(current.CustomLinks, "siteFaviconUrl")
	if oldFaviconURL != newFaviconURL {
		if oldFaviconURL != "" {
			if err := u.imageRefRepo.AdjustByURLs(ctx, []string{oldFaviconURL}, "favicon", -1); err != nil {
				return nil, fmt.Errorf("decrement favicon reference: %w", err)
			}
		}
		if newFaviconURL != "" {
			if err := u.imageRefRepo.AdjustByURLs(ctx, []string{newFaviconURL}, "favicon", 1); err != nil {
				return nil, fmt.Errorf("increment favicon reference: %w", err)
			}
		}
	}

	return updated, nil
}
