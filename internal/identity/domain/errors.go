package domain

import "errors"

var (
	// ErrPasswordPolicy is returned when a password does not satisfy the
	// password policy.
	ErrPasswordPolicy = errors.New("password does not meet policy")
	// ErrInvalidCredentials deliberately does not reveal whether the account or
	// password was invalid.
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidToken       = errors.New("invalid token")
	ErrTokenExpired       = errors.New("token expired")
)
