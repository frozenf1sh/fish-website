package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/frozenfish/fish-website/pkg/logger"
	"github.com/spf13/viper"
)

// Config holds all application configuration
type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	Storage  StorageConfig
	Auth     AuthConfig
	CORS     CORSConfig
	Logger   LoggerConfig
}

// ServerConfig holds server-related configuration
type ServerConfig struct {
	Address          string
	MigrateOnly      bool
	EnableReflection bool
}

// DatabaseConfig holds database-related configuration
type DatabaseConfig struct {
	DSN string
}

// StorageConfig groups outbound object-storage configuration.
type StorageConfig struct {
	R2 R2Config
}

// R2Config holds Cloudflare R2's S3 API credentials and its distinct public
// read origin. The public origin is intentionally separate from the S3 API
// endpoint because presigned writes must never be issued against the CDN host.
type R2Config struct {
	Endpoint        string
	AccessKeyID     string
	SecretAccessKey string
	Bucket          string
	UseSSL          bool
	PublicBaseURL   string
}

// AuthConfig holds authentication-related configuration
type AuthConfig struct {
	OwnerUsername     string
	AdminPassword     string // Deprecated transitional input. Do not set in new deployments.
	AdminPasswordHash string
	JWTSecret         string
	TokenTTLSeconds   int
}

// CORSConfig defines browser origins that may call the API cross-origin.
// Origins are explicit by design; wildcard origins are never valid here.
type CORSConfig struct {
	AllowedOrigins []string
}

// LoggerConfig holds logger-related configuration
type LoggerConfig struct {
	Level     logger.Level
	JSON      bool
	AddSource bool
}

// Load loads configuration from config file, environment variables and defaults
func Load() (*Config, error) {
	v := viper.New()

	// Set defaults
	setDefaults(v)

	// Try to load config file
	v.SetConfigName("config")
	v.SetConfigType("yaml")
	v.AddConfigPath(".")
	v.AddConfigPath("/app")

	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); ok {
			// Config file not found, continue with env vars
		} else {
			return nil, fmt.Errorf("read config file: %w", err)
		}
	}

	// Bind explicitly named environment variables. Configuration remains
	// discoverable without retaining provider-era compatibility aliases.
	bindEnvironment(v)

	// Configure environment variables - first try nested names, then legacy
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	// Unmarshal configuration
	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unmarshal config: %w", err)
	}

	// Preserve explicitly supplied environment values when a config file omits
	// them. This is intentionally not a legacy alias layer.
	applyEnvironmentFallback(&cfg)

	// Validate configuration
	if err := validate(&cfg); err != nil {
		return nil, fmt.Errorf("validate config: %w", err)
	}

	return &cfg, nil
}

func bindEnvironment(v *viper.Viper) {
	// Database
	if val := os.Getenv("POSTGRES_DSN"); val != "" {
		v.Set("Database.DSN", val)
	}

	// Cloudflare R2
	if val := os.Getenv("R2_ENDPOINT"); val != "" {
		v.Set("Storage.R2.Endpoint", val)
	}
	if val := os.Getenv("R2_ACCESS_KEY_ID"); val != "" {
		v.Set("Storage.R2.AccessKeyID", val)
	}
	if val := os.Getenv("R2_SECRET_ACCESS_KEY"); val != "" {
		v.Set("Storage.R2.SecretAccessKey", val)
	}
	if val := os.Getenv("R2_USE_SSL"); val != "" {
		v.Set("Storage.R2.UseSSL", val == "true" || val == "1")
	}
	if val := os.Getenv("R2_BUCKET"); val != "" {
		v.Set("Storage.R2.Bucket", val)
	}
	if val := os.Getenv("R2_PUBLIC_BASE_URL"); val != "" {
		v.Set("Storage.R2.PublicBaseURL", val)
	}

	// Auth
	if val := os.Getenv("ADMIN_PASSWORD"); val != "" {
		v.Set("Auth.AdminPassword", val)
	}
	if val := os.Getenv("ADMIN_PASSWORD_HASH"); val != "" {
		v.Set("Auth.AdminPasswordHash", val)
	}
	if val := os.Getenv("ADMIN_USERNAME"); val != "" {
		v.Set("Auth.OwnerUsername", val)
	}
	if val := os.Getenv("AUTH_TOKEN_TTL_SECONDS"); val != "" {
		v.Set("Auth.TokenTTLSeconds", val)
	}
	if val := os.Getenv("JWT_SECRET"); val != "" {
		v.Set("Auth.JWTSecret", val)
	}

	if val := os.Getenv("CORS_ALLOWED_ORIGINS"); val != "" {
		v.Set("CORS.AllowedOrigins", splitCSV(val))
	}

	// Server
	if val := os.Getenv("SERVER_ADDRESS"); val != "" {
		v.Set("Server.Address", val)
	}
	if val := os.Getenv("MIGRATE_ONLY"); val != "" {
		v.Set("Server.MigrateOnly", val == "true" || val == "1")
	}
	if val := os.Getenv("ENABLE_REFLECTION"); val != "" {
		v.Set("Server.EnableReflection", val == "true" || val == "1")
	}

	// Logger
	if val := os.Getenv("LOGGER_LEVEL"); val != "" {
		v.Set("Logger.Level", val)
	}
	if val := os.Getenv("LOGGER_JSON"); val != "" {
		v.Set("Logger.JSON", val == "true" || val == "1")
	}
	if val := os.Getenv("LOGGER_ADD_SOURCE"); val != "" {
		v.Set("Logger.AddSource", val == "true" || val == "1")
	}
}

func applyEnvironmentFallback(cfg *Config) {
	if val := os.Getenv("POSTGRES_DSN"); val != "" && cfg.Database.DSN == "" {
		cfg.Database.DSN = val
	}
	if val := os.Getenv("R2_ENDPOINT"); val != "" && cfg.Storage.R2.Endpoint == "" {
		cfg.Storage.R2.Endpoint = val
	}
	if val := os.Getenv("R2_ACCESS_KEY_ID"); val != "" && cfg.Storage.R2.AccessKeyID == "" {
		cfg.Storage.R2.AccessKeyID = val
	}
	if val := os.Getenv("R2_SECRET_ACCESS_KEY"); val != "" && cfg.Storage.R2.SecretAccessKey == "" {
		cfg.Storage.R2.SecretAccessKey = val
	}
	if val := os.Getenv("R2_USE_SSL"); val != "" {
		cfg.Storage.R2.UseSSL = val == "true" || val == "1"
	}
	if val := os.Getenv("R2_BUCKET"); val != "" && cfg.Storage.R2.Bucket == "" {
		cfg.Storage.R2.Bucket = val
	}
	if val := os.Getenv("R2_PUBLIC_BASE_URL"); val != "" && cfg.Storage.R2.PublicBaseURL == "" {
		cfg.Storage.R2.PublicBaseURL = val
	}
	if val := os.Getenv("ADMIN_PASSWORD"); val != "" && cfg.Auth.AdminPassword == "" {
		cfg.Auth.AdminPassword = val
	}
	if val := os.Getenv("ADMIN_PASSWORD_HASH"); val != "" && cfg.Auth.AdminPasswordHash == "" {
		cfg.Auth.AdminPasswordHash = val
	}
	if val := os.Getenv("ADMIN_USERNAME"); val != "" && cfg.Auth.OwnerUsername == "" {
		cfg.Auth.OwnerUsername = val
	}
	if val := os.Getenv("AUTH_TOKEN_TTL_SECONDS"); val != "" && cfg.Auth.TokenTTLSeconds == 0 {
		cfg.Auth.TokenTTLSeconds, _ = strconv.Atoi(val)
	}
	if val := os.Getenv("CORS_ALLOWED_ORIGINS"); val != "" && len(cfg.CORS.AllowedOrigins) == 0 {
		cfg.CORS.AllowedOrigins = splitCSV(val)
	}
	if val := os.Getenv("JWT_SECRET"); val != "" && cfg.Auth.JWTSecret == "" {
		cfg.Auth.JWTSecret = val
	}
	if val := os.Getenv("SERVER_ADDRESS"); val != "" && cfg.Server.Address == "" {
		cfg.Server.Address = val
	}
	if val := os.Getenv("MIGRATE_ONLY"); val != "" {
		cfg.Server.MigrateOnly = val == "true" || val == "1"
	}
	if val := os.Getenv("ENABLE_REFLECTION"); val != "" {
		cfg.Server.EnableReflection = val == "true" || val == "1"
	}
}

func setDefaults(v *viper.Viper) {
	// Server defaults
	v.SetDefault("Server.Address", ":8080")

	// Auth defaults
	v.SetDefault("Auth.OwnerUsername", "admin")
	v.SetDefault("Auth.TokenTTLSeconds", 900)

	// Local development is safe by default. All deployed environments override
	// this with their public HTTPS origins through a non-secret environment value.
	v.SetDefault("CORS.AllowedOrigins", []string{"http://localhost:5173"})

	// Logger defaults
	v.SetDefault("Logger.Level", "info")
	v.SetDefault("Logger.JSON", false)
	v.SetDefault("Logger.AddSource", false)
}

func validate(cfg *Config) error {
	if cfg.Database.DSN == "" {
		return fmt.Errorf("database DSN is required")
	}
	if cfg.Storage.R2.Endpoint == "" {
		return fmt.Errorf("R2 endpoint is required")
	}
	if cfg.Storage.R2.AccessKeyID == "" {
		return fmt.Errorf("R2 access key ID is required")
	}
	if cfg.Storage.R2.SecretAccessKey == "" {
		return fmt.Errorf("R2 secret access key is required")
	}
	if cfg.Storage.R2.Bucket == "" {
		return fmt.Errorf("R2 bucket is required")
	}
	if cfg.Storage.R2.PublicBaseURL == "" {
		return fmt.Errorf("R2 public base URL is required")
	}
	if cfg.Auth.OwnerUsername == "" {
		return fmt.Errorf("owner username is required")
	}
	if cfg.Auth.AdminPasswordHash == "" && cfg.Auth.AdminPassword == "" {
		return fmt.Errorf("admin password hash is required")
	}
	if len(cfg.Auth.JWTSecret) < 32 {
		return fmt.Errorf("JWT secret must contain at least 32 bytes")
	}
	if cfg.Auth.TokenTTLSeconds <= 0 || cfg.Auth.TokenTTLSeconds > 24*60*60 {
		return fmt.Errorf("auth token TTL must be between 1 and 86400 seconds")
	}
	if len(cfg.CORS.AllowedOrigins) == 0 {
		return fmt.Errorf("at least one CORS allowed origin is required")
	}
	for _, origin := range cfg.CORS.AllowedOrigins {
		if origin == "*" || !strings.HasPrefix(origin, "http://") && !strings.HasPrefix(origin, "https://") {
			return fmt.Errorf("CORS allowed origins must be explicit http(s) origins")
		}
	}
	return nil
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	origins := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			origins = append(origins, trimmed)
		}
	}
	return origins
}
