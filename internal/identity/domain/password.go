// Package domain contains identity invariants that do not depend on transport,
// configuration, persistence, or framework packages.
package domain

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	argon2Version     = argon2.Version
	argon2MemoryKiB   = 64 * 1024
	argon2Iterations  = 3
	argon2Parallelism = 2
	argon2SaltLength  = 16
	argon2KeyLength   = 32
)

var ErrInvalidPasswordHash = errors.New("invalid password hash")

// HashPassword derives an Argon2id PHC string suitable for persistent storage.
func HashPassword(password string) (string, error) {
	if password == "" {
		return "", errors.New("password must not be empty")
	}

	salt := make([]byte, argon2SaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate password salt: %w", err)
	}

	hash := argon2.IDKey([]byte(password), salt, argon2Iterations, argon2MemoryKiB, argon2Parallelism, argon2KeyLength)
	return fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2Version,
		argon2MemoryKiB,
		argon2Iterations,
		argon2Parallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	), nil
}

// VerifyPassword validates a password against an Argon2id PHC string. It uses
// a constant-time comparison once parsing has completed.
func VerifyPassword(password, encodedHash string) (bool, error) {
	params, salt, expectedHash, err := parsePasswordHash(encodedHash)
	if err != nil {
		return false, err
	}

	actualHash := argon2.IDKey([]byte(password), salt, params.iterations, params.memoryKiB, params.parallelism, uint32(len(expectedHash)))
	return subtle.ConstantTimeCompare(actualHash, expectedHash) == 1, nil
}

type argon2Params struct {
	memoryKiB   uint32
	iterations  uint32
	parallelism uint8
}

func parsePasswordHash(encodedHash string) (argon2Params, []byte, []byte, error) {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 || parts[0] != "" || parts[1] != "argon2id" {
		return argon2Params{}, nil, nil, ErrInvalidPasswordHash
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2Version {
		return argon2Params{}, nil, nil, ErrInvalidPasswordHash
	}

	params := argon2Params{}
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &params.memoryKiB, &params.iterations, &params.parallelism); err != nil || params.memoryKiB == 0 || params.iterations == 0 || params.parallelism == 0 {
		return argon2Params{}, nil, nil, ErrInvalidPasswordHash
	}

	// Reject impractical work factors supplied by a malformed or compromised
	// configuration before they can make login requests consume unbounded memory.
	if params.memoryKiB > 256*1024 || params.iterations > 10 || params.parallelism > 8 {
		return argon2Params{}, nil, nil, ErrInvalidPasswordHash
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) < 8 {
		return argon2Params{}, nil, nil, ErrInvalidPasswordHash
	}
	hash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(hash) < 16 {
		return argon2Params{}, nil, nil, ErrInvalidPasswordHash
	}

	return params, salt, hash, nil
}

// IsArgon2idHash reports whether value is a valid bounded-cost PHC hash.
func IsArgon2idHash(value string) bool {
	_, _, _, err := parsePasswordHash(value)
	return err == nil
}
