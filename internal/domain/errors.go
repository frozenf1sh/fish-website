package domain

import "errors"

// Common errors
var (
	ErrNotFound          = errors.New("resource not found")
	ErrUnauthorized      = errors.New("unauthorized")
	ErrInvalidPassword   = errors.New("invalid password")
	ErrImageNotUploaded  = errors.New("image not uploaded yet")
	ErrInvalidToken      = errors.New("invalid token")
	ErrTokenExpired      = errors.New("token expired")
)
