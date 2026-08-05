package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"connectrpc.com/connect"
	"connectrpc.com/grpcreflect"
	"github.com/frozenfish/fish-website/db/migrations"
	homev1connect "github.com/frozenfish/fish-website/gen/go/home/v1/homev1connect"
	"github.com/frozenfish/fish-website/internal/delivery"
	pkgconfig "github.com/frozenfish/fish-website/pkg/config"
	"github.com/frozenfish/fish-website/pkg/logger"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/cors"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
)

// Server represents the application server
type Server struct {
	cfg             *pkgconfig.Config
	pool            *pgxpool.Pool
	handler         *delivery.Handler
	authInterceptor connect.Interceptor
}

// NewServer creates a new Server
func NewServer(
	cfg *pkgconfig.Config,
	pool *pgxpool.Pool,
	handler *delivery.Handler,
	authInterceptor connect.Interceptor,
) *Server {
	return &Server{
		cfg:             cfg,
		pool:            pool,
		handler:         handler,
		authInterceptor: authInterceptor,
	}
}

// Start starts the server
func (s *Server) Start(ctx context.Context) error {
	logger.Info("starting server", logger.String("address", s.cfg.Server.Address))

	// Run database migrations
	logger.Info("running database migrations")
	if err := s.Migrate(ctx); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}
	logger.Info("database migrations completed")

	// Setup HTTP handlers
	logger.Debug("setting up HTTP handlers")
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := s.pool.Ping(ctx); err != nil {
			http.Error(w, "database unavailable", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	// Add reflection
	logger.Debug("adding gRPC reflection service")
	reflector := grpcreflect.NewStaticReflector(
		homev1connect.AuthServiceName,
		homev1connect.PostServiceName,
		homev1connect.BlogServiceName,
		homev1connect.AlbumServiceName,
		homev1connect.SettingsServiceName,
	)
	mux.Handle(grpcreflect.NewHandlerV1(reflector))
	mux.Handle(grpcreflect.NewHandlerV1Alpha(reflector))

	// Connect-RPC options with interceptors
	opts := []connect.HandlerOption{
		connect.WithInterceptors(s.authInterceptor),
	}

	// Register handlers
	logger.Debug("registering Connect-RPC handlers")
	mux.Handle(homev1connect.NewAuthServiceHandler(s.handler, opts...))
	mux.Handle(homev1connect.NewPostServiceHandler(s.handler, opts...))
	mux.Handle(homev1connect.NewBlogServiceHandler(s.handler, opts...))
	mux.Handle(homev1connect.NewAlbumServiceHandler(s.handler, opts...))
	mux.Handle(homev1connect.NewSettingsServiceHandler(s.handler, opts...))

	// CORS configuration
	logger.Debug("configuring CORS middleware")
	c := cors.New(cors.Options{
		AllowedOrigins: s.cfg.CORS.AllowedOrigins,
		AllowedMethods: []string{
			http.MethodPost,
			http.MethodOptions,
		},
		AllowedHeaders: []string{
			"Accept",
			"Accept-Language",
			"Authorization",
			"Content-Type",
			"Connect-Protocol-Version",
			"Connect-Timeout-Ms",
			"Grpc-Timeout",
			"X-User-Agent",
		},
		ExposedHeaders: []string{
			"Connect-Protocol-Version",
			"Connect-Timeout-Ms",
			"Grpc-Status",
			"Grpc-Message",
			"Grpc-Status-Details-Bin",
		},
		MaxAge: 7200,
	})

	// Wrap with CORS and h2c
	handler := c.Handler(mux)
	handler = h2c.NewHandler(handler, &http2.Server{})

	// Create server
	srv := &http.Server{
		Addr:    s.cfg.Server.Address,
		Handler: handler,
	}

	// Start server in goroutine
	go func() {
		logger.Info("server starting", logger.String("address", s.cfg.Server.Address))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server failed to start", logger.Err(err))
			os.Exit(1)
		}
	}()

	// Wait for shutdown signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit
	logger.Info("received shutdown signal", logger.String("signal", sig.String()))
	logger.Info("shutting down server...")

	// Shutdown with timeout
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("server shutdown error", logger.Err(err))
		return fmt.Errorf("server shutdown: %w", err)
	}

	// Close database pool
	logger.Debug("closing database connection pool")
	s.pool.Close()

	logger.Info("server shutdown complete")
	return nil
}

// Migrate applies the append-only migration history. It is exported for the
// dedicated migration entrypoint introduced in the next deployment phase.
func (s *Server) Migrate(ctx context.Context) error {
	return migrations.Apply(ctx, s.pool)
}

func main() {
	ctx := context.Background()

	// Initialize logger first (default config)
	logger.Init(logger.DefaultConfig())
	logger.Debug("logger initialized")

	// Load config
	logger.Debug("loading configuration")
	cfg, err := pkgconfig.Load()
	if err != nil {
		logger.Error("failed to load config", logger.Err(err))
		os.Exit(1)
	}

	// Re-initialize logger with config
	loggerConfig := logger.Config{
		Level:     cfg.Logger.Level,
		JSON:      cfg.Logger.JSON,
		AddSource: cfg.Logger.AddSource,
	}
	logger.Init(loggerConfig)
	logger.Info("configuration loaded",
		logger.String("log_level", string(cfg.Logger.Level)),
		logger.Bool("log_json", cfg.Logger.JSON))

	// A legacy raw password is accepted only during the hash migration. New
	// deployments use ADMIN_PASSWORD_HASH exclusively.
	if cfg.Auth.AdminPassword == "" && cfg.Auth.AdminPasswordHash == "" {
		logger.Error("owner credential configuration is required")
		os.Exit(1)
	}

	// Initialize server
	logger.Debug("initializing server")
	server, err := InitializeServer(ctx, cfg)
	if err != nil {
		logger.Error("failed to initialize server", logger.Err(err))
		os.Exit(1)
	}

	if cfg.Server.MigrateOnly {
		logger.Info("running database migration entrypoint")
		if err := server.Migrate(ctx); err != nil {
			logger.Error("database migration failed", logger.Err(err))
			os.Exit(1)
		}
		logger.Info("database migration completed")
		return
	}

	// Start server
	logger.Debug("starting server")
	if err := server.Start(ctx); err != nil {
		logger.Error("server error", logger.Err(err))
		os.Exit(1)
	}
}
