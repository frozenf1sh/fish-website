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
const refreshTokenTTL = 30 * 24 * time.Hour

const (
	tokenTypeAccess  = "access"
	tokenTypeRefresh = "refresh"
)

type authClaims struct {
	jwt.RegisteredClaims
	TokenType string `json:"typ"`
}

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

func NewOwnerAuthenticator(ownerUsername, passwordHash, jwtSecret string, tokenTTL time.Duration) *OwnerAuthenticator {
	service := &OwnerAuthenticator{
		ownerUsername: ownerUsername,
		passwordHash:  passwordHash,
		signingKey:    []byte(jwtSecret),
		tokenTTL:      tokenTTL,
		now:           time.Now,
	}
	if !identitydomain.IsArgon2idHash(service.passwordHash) {
		service.configErr = identitydomain.ErrInvalidPasswordHash
	}
	return service
}

// Login authenticates the configured owner and issues a short-lived access token.
func (s *OwnerAuthenticator) Login(_ context.Context, username, password string) (string, time.Time, error) {
	if s.configErr != nil {
		return "", time.Time{}, fmt.Errorf("initialize password verifier: %w", s.configErr)
	}
	if subtle.ConstantTimeCompare([]byte(username), []byte(s.ownerUsername)) != 1 {
		return "", time.Time{}, identitydomain.ErrInvalidCredentials
	}
	if err := identitydomain.ValidatePassword(password); err != nil {
		return "", time.Time{}, identitydomain.ErrInvalidCredentials
	}

	valid, err := identitydomain.VerifyPassword(password, s.passwordHash)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("verify password: %w", err)
	}
	if !valid {
		return "", time.Time{}, identitydomain.ErrInvalidCredentials
	}

	return s.issueToken(s.ownerUsername, tokenTypeAccess, s.tokenTTL)
}

// IssueRefreshToken creates a long-lived token intended only for the HttpOnly
// refresh cookie. It is never accepted by authenticated application methods.
func (s *OwnerAuthenticator) IssueRefreshToken() (string, time.Time, error) {
	return s.issueToken(s.ownerUsername, tokenTypeRefresh, refreshTokenTTL)
}

// Refresh validates a refresh token and issues a new short-lived access token.
func (s *OwnerAuthenticator) Refresh(_ context.Context, refreshToken string) (string, time.Time, error) {
	claims, err := s.parseToken(refreshToken, tokenTypeRefresh)
	if err != nil {
		return "", time.Time{}, err
	}
	return s.issueToken(claims.Subject, tokenTypeAccess, s.tokenTTL)
}

func (s *OwnerAuthenticator) issueToken(subject, tokenType string, ttl time.Duration) (string, time.Time, error) {
	now := s.now().UTC()
	expiresAt := now.Add(ttl)
	claims := authClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    tokenIssuer,
			Subject:   subject,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
		TokenType: tokenType,
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
	claims, err := s.parseToken(tokenString, tokenTypeAccess)
	if err != nil {
		return "", err
	}
	return claims.Subject, nil
}

func (s *OwnerAuthenticator) parseToken(tokenString, expectedType string) (*authClaims, error) {
	claims := &authClaims{}
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
		jwt.WithLeeway(time.Second),
	)
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, identitydomain.ErrTokenExpired
		}
		return nil, fmt.Errorf("parse token: %w", err)
	}
	if claims.TokenType != expectedType {
		return nil, identitydomain.ErrInvalidToken
	}
	if !token.Valid || claims.Subject == "" || subtle.ConstantTimeCompare([]byte(claims.Subject), []byte(s.ownerUsername)) != 1 {
		return nil, identitydomain.ErrInvalidToken
	}
	return claims, nil
}
