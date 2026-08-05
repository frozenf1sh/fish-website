package domain

import "errors"

// Common errors
var (
	ErrNotFound            = errors.New("resource not found")
	ErrUnauthorized        = errors.New("unauthorized")
	ErrImageNotUploaded    = errors.New("image not uploaded yet")
	ErrInvalidImageUpload  = errors.New("invalid image upload")
	ErrImageUploadMismatch = errors.New("uploaded object does not match upload grant")
)
