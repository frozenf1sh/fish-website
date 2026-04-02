package config

import (
	"fmt"
	"strings"

	"github.com/frozenfish/fish-website/pkg/logger"
	"github.com/spf13/viper"
)

// Config holds all application configuration
type Config struct {
	Server       ServerConfig
	Database     DatabaseConfig
	MinIO        MinIOConfig
	Auth         AuthConfig
	Logger       LoggerConfig
}

// ServerConfig holds server-related configuration
type ServerConfig struct {
	Address string
}

// DatabaseConfig holds database-related configuration
type DatabaseConfig struct {
	DSN string
}

// MinIOConfig holds MinIO-related configuration
type MinIOConfig struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	UseSSL    bool
	Bucket    string
}

// AuthConfig holds authentication-related configuration
type AuthConfig struct {
	AdminPassword string
	JWTSecret     string
}

// LoggerConfig holds logger-related configuration
type LoggerConfig struct {
	Level     logger.Level
	JSON      bool
	AddSource bool
}

// Load loads configuration from environment variables and defaults
func Load() (*Config, error) {
	v := viper.New()

	// Set defaults
	setDefaults(v)

	// Configure environment variables
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	// Unmarshal configuration
	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unmarshal config: %w", err)
	}

	// Validate configuration
	if err := validate(&cfg); err != nil {
		return nil, fmt.Errorf("validate config: %w", err)
	}

	return &cfg, nil
}

func setDefaults(v *viper.Viper) {
	// Server defaults
	v.SetDefault("Server.Address", ":8080")

	// Database defaults
	v.SetDefault("Database.DSN", "postgres://fish:fish123456@postgres:5432/fish_website?sslmode=disable")

	// MinIO defaults
	v.SetDefault("MinIO.Endpoint", "minio:9000")
	v.SetDefault("MinIO.AccessKey", "fishminio")
	v.SetDefault("MinIO.SecretKey", "fishminio123456")
	v.SetDefault("MinIO.UseSSL", false)
	v.SetDefault("MinIO.Bucket", "fish-website")

	// Auth defaults
	v.SetDefault("Auth.JWTSecret", "your-super-secret-jwt-key-change-in-production")

	// Logger defaults
	v.SetDefault("Logger.Level", "info")
	v.SetDefault("Logger.JSON", false)
	v.SetDefault("Logger.AddSource", false)
}

func validate(cfg *Config) error {
	if cfg.Database.DSN == "" {
		return fmt.Errorf("database DSN is required")
	}
	if cfg.MinIO.Endpoint == "" {
		return fmt.Errorf("MinIO endpoint is required")
	}
	if cfg.MinIO.AccessKey == "" {
		return fmt.Errorf("MinIO access key is required")
	}
	if cfg.MinIO.SecretKey == "" {
		return fmt.Errorf("MinIO secret key is required")
	}
	if cfg.MinIO.Bucket == "" {
		return fmt.Errorf("MinIO bucket is required")
	}
	if cfg.Auth.AdminPassword == "" {
		return fmt.Errorf("admin password is required")
	}
	return nil
}
