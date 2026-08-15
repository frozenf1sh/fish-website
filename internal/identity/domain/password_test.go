package domain

import "testing"

func TestValidatePasswordPolicy(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name     string
		password string
		wantErr  bool
	}{
		{name: "short", password: "short-password", wantErr: true},
		{name: "passphrase", password: "correct horse battery staple", wantErr: false},
		{name: "unicode", password: "一条足够长的安全口令示例用于生产", wantErr: false},
		{name: "control character", password: "correct horse\nbattery staple", wantErr: true},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			if err := ValidatePassword(testCase.password); (err != nil) != testCase.wantErr {
				t.Fatalf("ValidatePassword() error = %v, wantErr = %v", err, testCase.wantErr)
			}
		})
	}
}

func TestHashPasswordRejectsWeakPassword(t *testing.T) {
	t.Parallel()

	if _, err := HashPassword("too-short"); err == nil {
		t.Fatal("HashPassword() accepted a password below the minimum length")
	}
}

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

func TestVerifyPasswordRejectsArgon2idHashBelowWorkFactorFloor(t *testing.T) {
	t.Parallel()

	if _, err := VerifyPassword("correct horse battery staple", "$argon2id$v=19$m=32768,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"); err != ErrInvalidPasswordHash {
		t.Fatalf("VerifyPassword() error = %v, want ErrInvalidPasswordHash", err)
	}
}
