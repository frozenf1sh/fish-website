package usecase

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/frozenfish/fish-website/internal/config"
	"github.com/frozenfish/fish-website/internal/domain"
	"github.com/golang-jwt/jwt/v5"
)

// AuthUsecase handles authentication logic
type AuthUsecase struct {
	cfg *config.Config
}

// NewAuthUsecase creates a new AuthUsecase
func NewAuthUsecase(cfg *config.Config) *AuthUsecase {
	return &AuthUsecase{cfg: cfg}
}

// Login authenticates the user and returns a token
func (u *AuthUsecase) Login(ctx context.Context, username, password string) (string, time.Time, error) {
	if u.cfg.AdminPassword == "" {
		return "", time.Time{}, errors.New("admin password not configured")
	}
	if password != u.cfg.AdminPassword {
		return "", time.Time{}, domain.ErrInvalidPassword
	}

	expiresAt := time.Now().Add(24 * time.Hour)
	claims := jwt.MapClaims{
		"sub": "admin",
		"exp": expiresAt.Unix(),
		"iat": time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(u.cfg.JWTSecret))
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign token: %w", err)
	}

	return tokenString, expiresAt, nil
}

// ValidateToken validates a JWT token
func (u *AuthUsecase) ValidateToken(ctx context.Context, tokenString string) (bool, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(u.cfg.JWTSecret), nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return false, domain.ErrTokenExpired
		}
		return false, fmt.Errorf("parse token: %w", err)
	}

	return token.Valid, nil
}
