package usecase

import (
	"context"
	"errors"
	"testing"

	"github.com/frozenfish/fish-website/internal/domain"
	identitydomain "github.com/frozenfish/fish-website/internal/identity/domain"
	pkgconfig "github.com/frozenfish/fish-website/pkg/config"
)

func TestAuthUsecaseLoginAndValidateToken(t *testing.T) {
	t.Parallel()

	hash, err := identitydomain.HashPassword("secret-password")
	if err != nil {
		t.Fatalf("HashPassword() error = %v", err)
	}
	u := NewAuthUsecase(&pkgconfig.Config{Auth: pkgconfig.AuthConfig{
		OwnerUsername:     "owner",
		AdminPasswordHash: hash,
		JWTSecret:         "01234567890123456789012345678901",
		TokenTTLSeconds:   900,
	}})

	token, expiresAt, err := u.Login(context.Background(), "owner", "secret-password")
	if err != nil {
		t.Fatalf("Login() error = %v", err)
	}
	if token == "" || expiresAt.IsZero() {
		t.Fatal("Login() returned an empty token or expiry")
	}

	user, err := u.ValidateToken(context.Background(), token)
	if err != nil {
		t.Fatalf("ValidateToken() error = %v", err)
	}
	if user != "owner" {
		t.Fatalf("ValidateToken() user = %q, want owner", user)
	}
}

func TestAuthUsecaseRejectsWrongUsernameOrPassword(t *testing.T) {
	t.Parallel()

	hash, err := identitydomain.HashPassword("secret-password")
	if err != nil {
		t.Fatalf("HashPassword() error = %v", err)
	}
	u := NewAuthUsecase(&pkgconfig.Config{Auth: pkgconfig.AuthConfig{
		OwnerUsername:     "owner",
		AdminPasswordHash: hash,
		JWTSecret:         "01234567890123456789012345678901",
		TokenTTLSeconds:   900,
	}})

	for _, testCase := range []struct {
		name     string
		username string
		password string
	}{
		{name: "wrong username", username: "other", password: "secret-password"},
		{name: "wrong password", username: "owner", password: "wrong-password"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			_, _, err := u.Login(context.Background(), testCase.username, testCase.password)
			if !errors.Is(err, domain.ErrInvalidPassword) {
				t.Fatalf("Login() error = %v, want ErrInvalidPassword", err)
			}
		})
	}
}
