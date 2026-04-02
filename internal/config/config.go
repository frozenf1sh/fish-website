package config

import (
	pkgconfig "github.com/frozenfish/fish-website/pkg/config"
)

// Config is an alias for backward compatibility
type Config = pkgconfig.Config

// Load loads configuration (backward compatible)
func Load() *Config {
	cfg, _ := pkgconfig.Load()
	return cfg
}
