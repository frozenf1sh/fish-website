package config

import (
	"fmt"
	"os"
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

	// Bind old environment variable names for backward compatibility
	bindLegacyEnvVars(v)

	// Configure environment variables - first try nested names, then legacy
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	// Unmarshal configuration
	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unmarshal config: %w", err)
	}

	// Apply legacy env vars for any missing values
	applyLegacyEnvVars(&cfg)

	// Validate configuration
	if err := validate(&cfg); err != nil {
		return nil, fmt.Errorf("validate config: %w", err)
	}

	return &cfg, nil
}

func bindLegacyEnvVars(v *viper.Viper) {
	// Database
	if val := os.Getenv("POSTGRES_DSN"); val != "" {
		v.Set("Database.DSN", val)
	}

	// MinIO
	if val := os.Getenv("MINIO_ENDPOINT"); val != "" {
		v.Set("MinIO.Endpoint", val)
	}
	if val := os.Getenv("MINIO_ACCESS_KEY"); val != "" {
		v.Set("MinIO.AccessKey", val)
	}
	if val := os.Getenv("MINIO_SECRET_KEY"); val != "" {
		v.Set("MinIO.SecretKey", val)
	}
	if val := os.Getenv("MINIO_USE_SSL"); val != "" {
		v.Set("MinIO.UseSSL", val == "true" || val == "1")
	}
	if val := os.Getenv("MINIO_BUCKET_NAME"); val != "" {
		v.Set("MinIO.Bucket", val)
	}
	if val := os.Getenv("MINIO_BUCKET"); val != "" {
		v.Set("MinIO.Bucket", val)
	}

	// Auth
	if val := os.Getenv("ADMIN_PASSWORD"); val != "" {
		v.Set("Auth.AdminPassword", val)
	}
	if val := os.Getenv("JWT_SECRET"); val != "" {
		v.Set("Auth.JWTSecret", val)
	}

	// Server
	if val := os.Getenv("SERVER_ADDRESS"); val != "" {
		v.Set("Server.Address", val)
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

func applyLegacyEnvVars(cfg *Config) {
	// This function ensures backward compatibility
	if val := os.Getenv("POSTGRES_DSN"); val != "" && cfg.Database.DSN == "" {
		cfg.Database.DSN = val
	}
	if val := os.Getenv("MINIO_ENDPOINT"); val != "" && cfg.MinIO.Endpoint == "" {
		cfg.MinIO.Endpoint = val
	}
	if val := os.Getenv("MINIO_ACCESS_KEY"); val != "" && cfg.MinIO.AccessKey == "" {
		cfg.MinIO.AccessKey = val
	}
	if val := os.Getenv("MINIO_SECRET_KEY"); val != "" && cfg.MinIO.SecretKey == "" {
		cfg.MinIO.SecretKey = val
	}
	if val := os.Getenv("MINIO_USE_SSL"); val != "" {
		cfg.MinIO.UseSSL = val == "true" || val == "1"
	}
	if val := os.Getenv("MINIO_BUCKET_NAME"); val != "" && cfg.MinIO.Bucket == "" {
		cfg.MinIO.Bucket = val
	}
	if val := os.Getenv("MINIO_BUCKET"); val != "" && cfg.MinIO.Bucket == "" {
		cfg.MinIO.Bucket = val
	}
	if val := os.Getenv("ADMIN_PASSWORD"); val != "" && cfg.Auth.AdminPassword == "" {
		cfg.Auth.AdminPassword = val
	}
	if val := os.Getenv("JWT_SECRET"); val != "" && cfg.Auth.JWTSecret == "" {
		cfg.Auth.JWTSecret = val
	}
	if val := os.Getenv("SERVER_ADDRESS"); val != "" && cfg.Server.Address == "" {
		cfg.Server.Address = val
	}
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
