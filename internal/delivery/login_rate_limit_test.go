package delivery

import (
	"net/http"
	"testing"
	"time"
)

func TestLoginRateLimiterBlocksRepeatedFailuresAndResetsOnSuccess(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 8, 15, 12, 0, 0, 0, time.UTC)
	limiter := newLoginRateLimiter()
	limiter.now = func() time.Time { return now }
	key := "admin\x00192.0.2.10"

	for attempt := 0; attempt < loginMaxFailures; attempt++ {
		if !limiter.allow(key) {
			t.Fatalf("allow() blocked attempt %d before the failure threshold", attempt+1)
		}
		limiter.recordFailure(key)
	}
	if limiter.allow(key) {
		t.Fatal("allow() accepted a request while the key was blocked")
	}

	limiter.reset(key)
	if !limiter.allow(key) {
		t.Fatal("allow() blocked the key after a successful-login reset")
	}
}

func TestLoginRateLimitKeyUsesProxyClientAddress(t *testing.T) {
	t.Parallel()

	headers := http.Header{}
	headers.Set("X-Forwarded-For", "192.0.2.10, 10.0.0.1")
	if got, want := loginRateLimitKey("admin", headers), "admin\x00192.0.2.10"; got != want {
		t.Fatalf("loginRateLimitKey() = %q, want %q", got, want)
	}

	headers.Set("X-Real-IP", "192.0.2.20")
	if got, want := loginRateLimitKey("admin", headers), "admin\x00192.0.2.20"; got != want {
		t.Fatalf("loginRateLimitKey() with X-Real-IP = %q, want %q", got, want)
	}
}
