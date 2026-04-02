package usecase

import (
	"context"
	"errors"
	"fmt"
	"time"

	pkgconfig "github.com/frozenfish/fish-website/pkg/config"
	"github.com/frozenfish/fish-website/pkg/logger"
	"github.com/frozenfish/fish-website/internal/domain"
	"github.com/golang-jwt/jwt/v5"
)

// AuthUsecase handles authentication logic
type AuthUsecase struct {
	cfg *pkgconfig.Config
}

// NewAuthUsecase creates a new AuthUsecase
func NewAuthUsecase(cfg *pkgconfig.Config) *AuthUsecase {
	return &AuthUsecase{cfg: cfg}
}

// Login authenticates the user and returns a token
func (u *AuthUsecase) Login(ctx context.Context, username, password string) (string, time.Time, error) {
	logger.Info("login attempt", logger.String("username", username))

	if u.cfg.Auth.AdminPassword == "" {
		logger.Error("admin password not configured")
		return "", time.Time{}, errors.New("admin password not configured")
	}

	if password != u.cfg.Auth.AdminPassword {
		logger.Warn("invalid password for login attempt", logger.String("username", username))
		return "", time.Time{}, domain.ErrInvalidPassword
	}

	logger.Info("login successful", logger.String("username", username))

	expiresAt := time.Now().Add(24 * time.Hour)
	claims := jwt.MapClaims{
		"sub": "admin",
		"exp": expiresAt.Unix(),
		"iat": time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(u.cfg.Auth.JWTSecret))
	if err != nil {
		logger.Error("failed to sign JWT token", logger.Err(err))
		return "", time.Time{}, fmt.Errorf("sign token: %w", err)
	}

	logger.Debug("JWT token generated", logger.String("expires_at", expiresAt.String()))
	return tokenString, expiresAt, nil
}

// ValidateToken validates a JWT token
func (u *AuthUsecase) ValidateToken(ctx context.Context, tokenString string) (bool, error) {
	logger.Debug("validating JWT token")

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(u.cfg.Auth.JWTSecret), nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			logger.Debug("token expired")
			return false, domain.ErrTokenExpired
		}
		logger.Error("failed to parse JWT token", logger.Err(err))
		return false, fmt.Errorf("parse token: %w", err)
	}

	logger.Debug("token validation successful", logger.Bool("valid", token.Valid))
	return token.Valid, nil
}
