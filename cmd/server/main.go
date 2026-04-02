package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"connectrpc.com/connect"
	"connectrpc.com/grpcreflect"
	homev1connect "github.com/frozenfish/fish-website/gen/go/home/v1/homev1connect"
	pkgconfig "github.com/frozenfish/fish-website/pkg/config"
	"github.com/frozenfish/fish-website/pkg/logger"
	"github.com/frozenfish/fish-website/internal/delivery"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/cors"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
)

// Server represents the application server
type Server struct {
	cfg              *pkgconfig.Config
	pool             *pgxpool.Pool
	handler          *delivery.Handler
	authInterceptor  connect.Interceptor
}

// NewServer creates a new Server
func NewServer(
	cfg *pkgconfig.Config,
	pool *pgxpool.Pool,
	handler *delivery.Handler,
	authInterceptor connect.Interceptor,
) *Server {
	return &Server{
		cfg:              cfg,
		pool:             pool,
		handler:          handler,
		authInterceptor:  authInterceptor,
	}
}

// Start starts the server
func (s *Server) Start(ctx context.Context) error {
	logger.Info("starting server", logger.String("address", s.cfg.Server.Address))

	// Run database migrations
	logger.Info("running database migrations")
	if err := s.runMigrations(ctx); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}
	logger.Info("database migrations completed")

	// Setup HTTP handlers
	logger.Debug("setting up HTTP handlers")
	mux := http.NewServeMux()

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
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{
			http.MethodGet,
			http.MethodPost,
			http.MethodPut,
			http.MethodPatch,
			http.MethodDelete,
			http.MethodOptions,
		},
		AllowedHeaders: []string{
			"*",
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

func (s *Server) runMigrations(ctx context.Context) error {
	// Read schema SQL
	schema, err := fs.ReadFile(embedSchema, "schema.sql")
	if err != nil {
		return fmt.Errorf("read schema: %w", err)
	}

	// Execute schema
	logger.Debug("executing schema SQL")
	_, err = s.pool.Exec(ctx, string(schema))
	if err != nil {
		return fmt.Errorf("execute schema: %w", err)
	}

	return nil
}

//go:embed schema.sql
var embedSchema embed.FS

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

	// Check for required admin password
	if cfg.Auth.AdminPassword == "" {
		logger.Error("ADMIN_PASSWORD environment variable is required")
		os.Exit(1)
	}

	// Initialize server
	logger.Debug("initializing server")
	server, err := InitializeServer(ctx, cfg)
	if err != nil {
		logger.Error("failed to initialize server", logger.Err(err))
		os.Exit(1)
	}

	// Start server
	logger.Debug("starting server")
	if err := server.Start(ctx); err != nil {
		logger.Error("server error", logger.Err(err))
		os.Exit(1)
	}
}
