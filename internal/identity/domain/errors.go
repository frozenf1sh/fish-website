package domain

import "errors"

var (
	// ErrInvalidCredentials deliberately does not reveal whether the account or
	// password was invalid.
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidToken       = errors.New("invalid token")
	ErrTokenExpired       = errors.New("token expired")
)
