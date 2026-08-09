package usecase

import (
	"context"
	"sync"
	"time"

	githubclient "github.com/frozenfish/fish-website/internal/github"
)

type GitHubUsecase struct {
	client    *githubclient.Client
	ttl       time.Duration
	mu        sync.Mutex
	cached    *githubclient.Activity
	fetchedAt time.Time
}

func NewGitHubUsecase(client *githubclient.Client, ttl time.Duration) *GitHubUsecase {
	return &GitHubUsecase{client: client, ttl: ttl}
}

func (u *GitHubUsecase) GetActivity(ctx context.Context) (*githubclient.Activity, error) {
	u.mu.Lock()
	if u.cached != nil && time.Since(u.fetchedAt) < u.ttl {
		cached := u.cached
		u.mu.Unlock()
		return cached, nil
	}
	u.mu.Unlock()

	activity, err := u.client.Fetch(ctx)
	if err != nil {
		return nil, err
	}
	u.mu.Lock()
	u.cached = activity
	u.fetchedAt = time.Now()
	u.mu.Unlock()
	return activity, nil
}
