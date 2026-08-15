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
	"unicode"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

const (
	// Passwords are deliberately length-based instead of composition-based:
	// long passphrases are easier to use and harder to guess than arbitrary
	// character-class rules.
	MinPasswordLength = 16
	MaxPasswordLength = 128
	maxPasswordBytes  = 1024

	argon2Version     = argon2.Version
	argon2MemoryKiB   = 64 * 1024
	argon2Iterations  = 3
	argon2Parallelism = 2
	argon2SaltLength  = 16
	argon2KeyLength   = 32
)

var ErrInvalidPasswordHash = errors.New("invalid password hash")

// ValidatePassword applies the policy to passwords being created or rotated.
// Spaces and Unicode letters are allowed so that users can use passphrases.
// Control characters are rejected because they are commonly introduced by
// accidental copy/paste and can make operational recovery ambiguous.
func ValidatePassword(password string) error {
	if !utf8.ValidString(password) {
		return fmt.Errorf("%w: password must be valid UTF-8", ErrPasswordPolicy)
	}
	if len(password) > maxPasswordBytes {
		return fmt.Errorf("%w: password is too large", ErrPasswordPolicy)
	}
	length := utf8.RuneCountInString(password)
	if length < MinPasswordLength {
		return fmt.Errorf("%w: password must contain at least %d characters", ErrPasswordPolicy, MinPasswordLength)
	}
	if length > MaxPasswordLength {
		return fmt.Errorf("%w: password must contain at most %d characters", ErrPasswordPolicy, MaxPasswordLength)
	}
	for _, character := range password {
		if unicode.IsControl(character) {
			return fmt.Errorf("%w: password must not contain control characters", ErrPasswordPolicy)
		}
	}
	return nil
}

// HashPassword derives an Argon2id PHC string suitable for persistent storage.
func HashPassword(password string) (string, error) {
	if err := ValidatePassword(password); err != nil {
		return "", err
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
	// Do not run Argon2id for unbounded or invalid input. Login applies the full
	// policy before reaching this function; keeping the bound here also protects
	// other callers from feeding oversized input into the KDF.
	if len(password) > maxPasswordBytes || !utf8.ValidString(password) {
		return false, nil
	}

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
	if params.memoryKiB < argon2MemoryKiB || params.iterations < argon2Iterations || params.parallelism < argon2Parallelism || params.memoryKiB > 256*1024 || params.iterations > 10 || params.parallelism > 8 {
		return argon2Params{}, nil, nil, ErrInvalidPasswordHash
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) < argon2SaltLength {
		return argon2Params{}, nil, nil, ErrInvalidPasswordHash
	}
	hash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(hash) < argon2KeyLength {
		return argon2Params{}, nil, nil, ErrInvalidPasswordHash
	}

	return params, salt, hash, nil
}

// IsArgon2idHash reports whether value is a valid bounded-cost PHC hash.
func IsArgon2idHash(value string) bool {
	_, _, _, err := parsePasswordHash(value)
	return err == nil
}
