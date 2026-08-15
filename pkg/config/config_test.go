package config

import "testing"

func TestValidateRejectsWildcardCORSOrigin(t *testing.T) {
	cfg := validConfig()
	cfg.CORS.AllowedOrigins = []string{"*"}

	if err := validate(&cfg); err == nil {
		t.Fatal("validate() accepted a wildcard CORS origin")
	}
}

func TestValidateAcceptsExplicitCORSOrigins(t *testing.T) {
	cfg := validConfig()
	cfg.CORS.AllowedOrigins = []string{"https://frozenf1sh.top", "http://localhost:5173"}

	if err := validate(&cfg); err != nil {
		t.Fatalf("validate() returned error for explicit origins: %v", err)
	}
}

func TestSplitCSV(t *testing.T) {
	got := splitCSV(" https://one.example, ,https://two.example ")
	want := []string{"https://one.example", "https://two.example"}
	if len(got) != len(want) {
		t.Fatalf("splitCSV() length = %d, want %d", len(got), len(want))
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("splitCSV()[%d] = %q, want %q", index, got[index], want[index])
		}
	}
}

func validConfig() Config {
	return Config{
		Database: DatabaseConfig{DSN: "postgres://example"},
		Storage: StorageConfig{R2: R2Config{
			Endpoint:        "r2.example",
			AccessKeyID:     "access-key",
			SecretAccessKey: "secret-key",
			Bucket:          "bucket",
			PublicBaseURL:   "https://media.example",
		}},
		Auth: AuthConfig{
			OwnerUsername:     "owner",
			AdminPasswordHash: "$argon2id$v=19$m=65536,t=3,p=2$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
			JWTSecret:         "at-least-thirty-two-characters-long",
			TokenTTLSeconds:   900,
		},
		GitHub: GitHubConfig{Username: "frozenf1sh", CacheTTLSeconds: 21600},
		CORS:   CORSConfig{AllowedOrigins: []string{"http://localhost:5173"}},
	}
}
