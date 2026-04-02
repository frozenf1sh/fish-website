package config

import (
	"os"
)

// Config holds all configuration
type Config struct {
	PostgresDSN     string
	MinIOEndpoint   string
	MinIOAccessKey  string
	MinIOSecretKey  string
	MinIOUseSSL     bool
	MinIOBucketName string
	AdminPassword   string
	JWTSecret       string
	ServerAddress   string
}

// Load loads configuration from environment variables
func Load() *Config {
	return &Config{
		PostgresDSN:     getEnv("POSTGRES_DSN", "postgres://fish:fish123456@localhost:5432/fish_website?sslmode=disable"),
		MinIOEndpoint:   getEnv("MINIO_ENDPOINT", "localhost:9000"),
		MinIOAccessKey:  getEnv("MINIO_ACCESS_KEY", "fishminio"),
		MinIOSecretKey:  getEnv("MINIO_SECRET_KEY", "fishminio123456"),
		MinIOUseSSL:     getEnvBool("MINIO_USE_SSL", false),
		MinIOBucketName: getEnv("MINIO_BUCKET_NAME", "fish-website"),
		AdminPassword:   getEnv("ADMIN_PASSWORD", ""),
		JWTSecret:       getEnv("JWT_SECRET", "your-super-secret-jwt-key-change-in-production"),
		ServerAddress:   getEnv("SERVER_ADDRESS", ":8080"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		return value == "true" || value == "1"
	}
	return defaultValue
}
