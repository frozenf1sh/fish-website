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
	"github.com/frozenfish/fish-website/internal/config"
	"github.com/frozenfish/fish-website/internal/delivery"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/cors"
	"github.com/rs/zerolog/log"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
)

// Server represents the application server
type Server struct {
	cfg          *config.Config
	pool         *pgxpool.Pool
	handler      *delivery.Handler
	authInterceptor connect.Interceptor
}

// NewServer creates a new Server
func NewServer(
	cfg *config.Config,
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
	// Run database migrations
	if err := s.runMigrations(ctx); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}

	// Setup HTTP handlers
	mux := http.NewServeMux()

	// Add reflection
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
	mux.Handle(homev1connect.NewAuthServiceHandler(s.handler, opts...))
	mux.Handle(homev1connect.NewPostServiceHandler(s.handler, opts...))
	mux.Handle(homev1connect.NewBlogServiceHandler(s.handler, opts...))
	mux.Handle(homev1connect.NewAlbumServiceHandler(s.handler, opts...))
	mux.Handle(homev1connect.NewSettingsServiceHandler(s.handler, opts...))

	// CORS configuration
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
		Addr:    s.cfg.ServerAddress,
		Handler: handler,
	}

	// Start server in goroutine
	go func() {
		log.Info().Msgf("server starting on %s", s.cfg.ServerAddress)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server failed to start")
		}
	}()

	// Wait for shutdown signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Info().Msg("shutting down server...")

	// Shutdown with timeout
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("server shutdown: %w", err)
	}

	// Close database pool
	s.pool.Close()

	log.Info().Msg("server shutdown complete")
	return nil
}

func (s *Server) runMigrations(ctx context.Context) error {
	// Read schema SQL
	schema, err := fs.ReadFile(embedSchema, "schema.sql")
	if err != nil {
		return fmt.Errorf("read schema: %w", err)
	}

	// Execute schema
	_, err = s.pool.Exec(ctx, string(schema))
	if err != nil {
		return fmt.Errorf("execute schema: %w", err)
	}

	log.Info().Msg("database migrations completed")
	return nil
}

//go:embed schema.sql
var embedSchema embed.FS

func main() {
	ctx := context.Background()

	// Load config
	cfg := config.Load()

	// Check for required admin password
	if cfg.AdminPassword == "" {
		log.Fatal().Msg("ADMIN_PASSWORD environment variable is required")
	}

	// Initialize server
	server, err := InitializeServer(ctx, cfg)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to initialize server")
	}

	// Start server
	if err := server.Start(ctx); err != nil {
		log.Fatal().Err(err).Msg("server error")
	}
}
