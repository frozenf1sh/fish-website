package delivery

import (
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	loginFailureWindow = 10 * time.Minute
	loginMaxFailures   = 5
	loginBlockDuration = 15 * time.Minute
	maxLoginRateKeys   = 4096
)

type loginRateLimitEntry struct {
	firstFailure time.Time
	failures     int
	blockedUntil time.Time
}

// loginRateLimiter is intentionally local to the process. The cluster has a
// single backend replica today; the network provider must still enforce a
// distributed limit at the edge when the service is scaled out.
type loginRateLimiter struct {
	mu      sync.Mutex
	entries map[string]loginRateLimitEntry
	now     func() time.Time
}

func newLoginRateLimiter() *loginRateLimiter {
	return &loginRateLimiter{
		entries: make(map[string]loginRateLimitEntry),
		now:     time.Now,
	}
}

func (l *loginRateLimiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	entry, ok := l.entries[key]
	if !ok {
		return true
	}
	if !entry.blockedUntil.IsZero() && now.Before(entry.blockedUntil) {
		return false
	}
	if now.Sub(entry.firstFailure) >= loginFailureWindow {
		delete(l.entries, key)
	}
	return true
}

func (l *loginRateLimiter) recordFailure(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	entry, ok := l.entries[key]
	if !ok || now.Sub(entry.firstFailure) >= loginFailureWindow {
		l.evictIfNeeded()
		entry = loginRateLimitEntry{firstFailure: now}
	}
	entry.failures++
	if entry.failures >= loginMaxFailures {
		entry.blockedUntil = now.Add(loginBlockDuration)
	}
	l.entries[key] = entry
}

func (l *loginRateLimiter) reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.entries, key)
}

func (l *loginRateLimiter) evictIfNeeded() {
	if len(l.entries) < maxLoginRateKeys {
		return
	}
	var oldestKey string
	var oldest time.Time
	for key, entry := range l.entries {
		if oldestKey == "" || entry.firstFailure.Before(oldest) {
			oldestKey = key
			oldest = entry.firstFailure
		}
	}
	if oldestKey != "" {
		delete(l.entries, oldestKey)
	}
}

func loginRateLimitKey(username string, headers http.Header) string {
	clientIP := strings.TrimSpace(headers.Get("X-Real-IP"))
	if clientIP == "" {
		clientIP = strings.TrimSpace(headers.Get("X-Forwarded-For"))
		if comma := strings.IndexByte(clientIP, ','); comma >= 0 {
			clientIP = strings.TrimSpace(clientIP[:comma])
		}
	}
	if clientIP == "" {
		clientIP = "unknown"
	}
	return username + "\x00" + clientIP
}
