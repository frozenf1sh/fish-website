package usecase

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"time"

	"github.com/frozenfish/fish-website/internal/domain"
	identitydomain "github.com/frozenfish/fish-website/internal/identity/domain"
	pkgconfig "github.com/frozenfish/fish-website/pkg/config"
	"github.com/frozenfish/fish-website/pkg/logger"
	"github.com/golang-jwt/jwt/v5"
)

const tokenIssuer = "fish-website"

// AuthUsecase is the transitional application adapter for the legacy RPC
// surface. Password verification lives in the identity domain package.
type AuthUsecase struct {
	cfg          *pkgconfig.Config
	passwordHash string
	configErr    error
	now          func() time.Time
}

// NewAuthUsecase creates a new AuthUsecase.
func NewAuthUsecase(cfg *pkgconfig.Config) *AuthUsecase {
	u := &AuthUsecase{cfg: cfg, passwordHash: cfg.Auth.AdminPasswordHash, now: time.Now}
	if u.passwordHash != "" {
		return u
	}

	// Existing clusters used ADMIN_PASSWORD. Never compare it directly: derive a
	// process-local Argon2id hash while the dedicated migration script adds the
	// persistent ADMIN_PASSWORD_HASH secret. This path is removed after rollout.
	logger.Warn("ADMIN_PASSWORD is deprecated; migrate to ADMIN_PASSWORD_HASH")
	u.passwordHash, u.configErr = identitydomain.HashPassword(cfg.Auth.AdminPassword)
	return u
}

// Login authenticates the configured owner and issues a short-lived owner token.
func (u *AuthUsecase) Login(_ context.Context, username, password string) (string, time.Time, error) {
	if u.configErr != nil {
		return "", time.Time{}, fmt.Errorf("initialize password verifier: %w", u.configErr)
	}
	if subtle.ConstantTimeCompare([]byte(username), []byte(u.cfg.Auth.OwnerUsername)) != 1 {
		logger.Warn("invalid login username")
		return "", time.Time{}, domain.ErrInvalidPassword
	}

	valid, err := identitydomain.VerifyPassword(password, u.passwordHash)
	if err != nil {
		logger.Error("configured password hash is invalid", logger.Err(err))
		return "", time.Time{}, fmt.Errorf("verify password: %w", err)
	}
	if !valid {
		logger.Warn("invalid login password", logger.String("username", username))
		return "", time.Time{}, domain.ErrInvalidPassword
	}

	now := u.now().UTC()
	expiresAt := now.Add(time.Duration(u.cfg.Auth.TokenTTLSeconds) * time.Second)
	claims := jwt.RegisteredClaims{
		Issuer:    tokenIssuer,
		Subject:   u.cfg.Auth.OwnerUsername,
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(expiresAt),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(u.cfg.Auth.JWTSecret))
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign token: %w", err)
	}

	return tokenString, expiresAt, nil
}

// ValidateToken validates a signed owner token and returns its subject.
func (u *AuthUsecase) ValidateToken(_ context.Context, tokenString string) (string, error) {
	claims := &jwt.RegisteredClaims{}
	token, err := jwt.ParseWithClaims(
		tokenString,
		claims,
		func(token *jwt.Token) (interface{}, error) {
			if token.Method != jwt.SigningMethodHS256 {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(u.cfg.Auth.JWTSecret), nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(tokenIssuer),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return "", domain.ErrTokenExpired
		}
		return "", fmt.Errorf("parse token: %w", err)
	}
	if !token.Valid || claims.Subject == "" || subtle.ConstantTimeCompare([]byte(claims.Subject), []byte(u.cfg.Auth.OwnerUsername)) != 1 {
		return "", domain.ErrInvalidToken
	}

	return claims.Subject, nil
}
