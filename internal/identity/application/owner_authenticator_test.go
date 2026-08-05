package application

import (
	"context"
	"errors"
	"testing"
	"time"

	identitydomain "github.com/frozenfish/fish-website/internal/identity/domain"
)

func TestOwnerAuthenticatorLoginAndValidateToken(t *testing.T) {
	t.Parallel()
	hash, err := identitydomain.HashPassword("secret-password")
	if err != nil {
		t.Fatalf("HashPassword() error = %v", err)
	}
	service := NewOwnerAuthenticator("owner", hash, "", "01234567890123456789012345678901", 15*time.Minute)

	token, expiresAt, err := service.Login(context.Background(), "owner", "secret-password")
	if err != nil {
		t.Fatalf("Login() error = %v", err)
	}
	if token == "" || expiresAt.IsZero() {
		t.Fatal("Login() returned an empty token or expiry")
	}
	user, err := service.ValidateToken(context.Background(), token)
	if err != nil {
		t.Fatalf("ValidateToken() error = %v", err)
	}
	if user != "owner" {
		t.Fatalf("ValidateToken() user = %q, want owner", user)
	}
}

func TestOwnerAuthenticatorRejectsWrongUsernameOrPassword(t *testing.T) {
	t.Parallel()
	hash, err := identitydomain.HashPassword("secret-password")
	if err != nil {
		t.Fatalf("HashPassword() error = %v", err)
	}
	service := NewOwnerAuthenticator("owner", hash, "", "01234567890123456789012345678901", 15*time.Minute)

	for _, testCase := range []struct{ username, password string }{
		{username: "other", password: "secret-password"},
		{username: "owner", password: "wrong-password"},
	} {
		_, _, err := service.Login(context.Background(), testCase.username, testCase.password)
		if !errors.Is(err, identitydomain.ErrInvalidCredentials) {
			t.Fatalf("Login() error = %v, want ErrInvalidCredentials", err)
		}
	}
}
