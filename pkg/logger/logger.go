package logger

import (
	"context"
	"log/slog"
	"os"
	"strings"
)

// Level represents log level
type Level string

const (
	LevelDebug Level = "debug"
	LevelInfo  Level = "info"
	LevelWarn  Level = "warn"
	LevelError Level = "error"
)

var (
	globalLogger *slog.Logger
)

// Config represents logger configuration
type Config struct {
	Level  Level
	JSON   bool
	AddSource bool
}

// DefaultConfig returns default logger config
func DefaultConfig() Config {
	return Config{
		Level:     LevelInfo,
		JSON:      false,
		AddSource: false,
	}
}

// Init initializes the global logger
func Init(cfg Config) {
	var handler slog.Handler

	opts := &slog.HandlerOptions{
		Level:     parseLevel(cfg.Level),
		AddSource: cfg.AddSource,
	}

	if cfg.JSON {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	} else {
		handler = slog.NewTextHandler(os.Stdout, opts)
	}

	globalLogger = slog.New(handler)
}

func parseLevel(level Level) slog.Level {
	switch strings.ToLower(string(level)) {
	case "debug":
		return slog.LevelDebug
	case "info":
		return slog.LevelInfo
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// Debug logs at debug level
func Debug(msg string, args ...any) {
	globalLogger.Debug(msg, args...)
}

// DebugContext logs at debug level with context
func DebugContext(ctx context.Context, msg string, args ...any) {
	globalLogger.DebugContext(ctx, msg, args...)
}

// Info logs at info level
func Info(msg string, args ...any) {
	globalLogger.Info(msg, args...)
}

// InfoContext logs at info level with context
func InfoContext(ctx context.Context, msg string, args ...any) {
	globalLogger.InfoContext(ctx, msg, args...)
}

// Warn logs at warn level
func Warn(msg string, args ...any) {
	globalLogger.Warn(msg, args...)
}

// WarnContext logs at warn level with context
func WarnContext(ctx context.Context, msg string, args ...any) {
	globalLogger.WarnContext(ctx, msg, args...)
}

// Error logs at error level
func Error(msg string, args ...any) {
	globalLogger.Error(msg, args...)
}

// ErrorContext logs at error level with context
func ErrorContext(ctx context.Context, msg string, args ...any) {
	globalLogger.ErrorContext(ctx, msg, args...)
}

// Log logs at the specified level
func Log(ctx context.Context, level slog.Level, msg string, args ...any) {
	globalLogger.Log(ctx, level, msg, args...)
}

// With returns a logger with the given attributes
func With(args ...any) *slog.Logger {
	return globalLogger.With(args...)
}

// Logger returns the global logger
func Logger() *slog.Logger {
	return globalLogger
}

// SetLogger sets the global logger
func SetLogger(l *slog.Logger) {
	globalLogger = l
}

// String returns a slog.Attr for string key-value
func String(key, value string) slog.Attr {
	return slog.String(key, value)
}

// Int returns a slog.Attr for int key-value
func Int(key string, value int) slog.Attr {
	return slog.Int(key, value)
}

// Int64 returns a slog.Attr for int64 key-value
func Int64(key string, value int64) slog.Attr {
	return slog.Int64(key, value)
}

// Err returns a slog.Attr for error
func Err(err error) slog.Attr {
	return slog.Any("error", err)
}

// Any returns a slog.Attr for any value
func Any(key string, value any) slog.Attr {
	return slog.Any(key, value)
}

// Bool returns a slog.Attr for bool key-value
func Bool(key string, value bool) slog.Attr {
	return slog.Bool(key, value)
}

// Strings returns a slog.Attr for string slice
func Strings(key string, value []string) slog.Attr {
	return slog.Any(key, value)
}
