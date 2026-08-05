package application

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"time"

	identitydomain "github.com/frozenfish/fish-website/internal/identity/domain"
	"github.com/golang-jwt/jwt/v5"
)

const tokenIssuer = "fish-website"

// OwnerAuthenticator is the identity application service for the single owner
// account. It deliberately accepts primitive configuration at the composition
// root, rather than depending on infrastructure configuration packages.
type OwnerAuthenticator struct {
	ownerUsername string
	passwordHash  string
	signingKey    []byte
	tokenTTL      time.Duration
	configErr     error
	now           func() time.Time
}

func NewOwnerAuthenticator(ownerUsername, passwordHash, legacyPassword, jwtSecret string, tokenTTL time.Duration) *OwnerAuthenticator {
	service := &OwnerAuthenticator{
		ownerUsername: ownerUsername,
		passwordHash:  passwordHash,
		signingKey:    []byte(jwtSecret),
		tokenTTL:      tokenTTL,
		now:           time.Now,
	}
	if service.passwordHash == "" {
		// Transitional support only: the plaintext is transformed in process and
		// never compared directly or retained by this application service.
		service.passwordHash, service.configErr = identitydomain.HashPassword(legacyPassword)
	}
	return service
}

// Login authenticates the configured owner and issues a short-lived token.
func (s *OwnerAuthenticator) Login(_ context.Context, username, password string) (string, time.Time, error) {
	if s.configErr != nil {
		return "", time.Time{}, fmt.Errorf("initialize password verifier: %w", s.configErr)
	}
	if subtle.ConstantTimeCompare([]byte(username), []byte(s.ownerUsername)) != 1 {
		return "", time.Time{}, identitydomain.ErrInvalidCredentials
	}

	valid, err := identitydomain.VerifyPassword(password, s.passwordHash)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("verify password: %w", err)
	}
	if !valid {
		return "", time.Time{}, identitydomain.ErrInvalidCredentials
	}

	now := s.now().UTC()
	expiresAt := now.Add(s.tokenTTL)
	claims := jwt.RegisteredClaims{
		Issuer:    tokenIssuer,
		Subject:   s.ownerUsername,
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(expiresAt),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(s.signingKey)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign token: %w", err)
	}
	return tokenString, expiresAt, nil
}

// ValidateToken validates a signed owner token and returns its subject.
func (s *OwnerAuthenticator) ValidateToken(_ context.Context, tokenString string) (string, error) {
	claims := &jwt.RegisteredClaims{}
	token, err := jwt.ParseWithClaims(
		tokenString,
		claims,
		func(token *jwt.Token) (interface{}, error) {
			if token.Method != jwt.SigningMethodHS256 {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return s.signingKey, nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(tokenIssuer),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return "", identitydomain.ErrTokenExpired
		}
		return "", fmt.Errorf("parse token: %w", err)
	}
	if !token.Valid || claims.Subject == "" || subtle.ConstantTimeCompare([]byte(claims.Subject), []byte(s.ownerUsername)) != 1 {
		return "", identitydomain.ErrInvalidToken
	}
	return claims.Subject, nil
}
