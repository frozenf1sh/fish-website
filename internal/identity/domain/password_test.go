package domain

import "testing"

func TestPasswordHashRoundTrip(t *testing.T) {
	t.Parallel()

	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("HashPassword() error = %v", err)
	}
	if !IsArgon2idHash(hash) {
		t.Fatal("IsArgon2idHash() = false for a generated hash")
	}

	valid, err := VerifyPassword("correct horse battery staple", hash)
	if err != nil {
		t.Fatalf("VerifyPassword() error = %v", err)
	}
	if !valid {
		t.Fatal("VerifyPassword() = false for the original password")
	}

	valid, err = VerifyPassword("incorrect", hash)
	if err != nil {
		t.Fatalf("VerifyPassword() error = %v", err)
	}
	if valid {
		t.Fatal("VerifyPassword() = true for an incorrect password")
	}
}

func TestVerifyPasswordRejectsMalformedHash(t *testing.T) {
	t.Parallel()

	if _, err := VerifyPassword("password", "$argon2id$v=19$m=999999,t=99,p=99$bad$bad"); err != ErrInvalidPasswordHash {
		t.Fatalf("VerifyPassword() error = %v, want ErrInvalidPasswordHash", err)
	}
}
