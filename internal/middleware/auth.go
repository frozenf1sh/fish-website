package middleware

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"connectrpc.com/connect"
	"github.com/frozenfish/fish-website/internal/domain"
	"github.com/frozenfish/fish-website/internal/usecase"
)

type contextKey string

const userContextKey contextKey = "user"

// AuthInterceptor is a Connect-RPC interceptor for JWT authentication
type AuthInterceptor struct {
	authUsecase *usecase.AuthUsecase
}

// NewAuthInterceptor creates a new AuthInterceptor
func NewAuthInterceptor(authUsecase *usecase.AuthUsecase) *AuthInterceptor {
	return &AuthInterceptor{authUsecase: authUsecase}
}

// RequireAuth is an interceptor that requires valid JWT authentication
func (i *AuthInterceptor) RequireAuth() connect.Interceptor {
	return connect.UnaryInterceptorFunc(func(next connect.UnaryFunc) connect.UnaryFunc {
		return connect.UnaryFunc(func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			// Skip auth for specified procedures
			if isPublicProcedure(req.Spec().Procedure) {
				return next(ctx, req)
			}

			token, err := extractToken(req.Header())
			if err != nil {
				return nil, connect.NewError(connect.CodeUnauthenticated, err)
			}

			valid, err := i.authUsecase.ValidateToken(ctx, token)
			if err != nil {
				if errors.Is(err, domain.ErrTokenExpired) {
					return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("token expired"))
				}
				return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid token"))
			}
			if !valid {
				return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid token"))
			}

			// Add user to context
			ctx = context.WithValue(ctx, userContextKey, "admin")

			return next(ctx, req)
		})
	})
}

func extractToken(headers http.Header) (string, error) {
	authHeader := headers.Get("Authorization")
	if authHeader == "" {
		return "", errors.New("authorization header required")
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || parts[0] != "Bearer" {
		return "", errors.New("authorization header format must be Bearer {token}")
	}

	return parts[1], nil
}

// Public procedures that don't require authentication
var publicProcedures = map[string]bool{
	"/home.v1.AuthService/Login":          true,
	"/home.v1.PostService/ListPosts":       true,
	"/home.v1.BlogService/ListArticles":    true,
	"/home.v1.BlogService/GetArticle":      true,
	"/home.v1.SettingsService/GetSettings": true,
}

func isPublicProcedure(procedure string) bool {
	return publicProcedures[procedure]
}

// NewAuthRequiredInterceptor creates an interceptor that requires auth for all non-public procedures
func NewAuthRequiredInterceptor(authUsecase *usecase.AuthUsecase) connect.Interceptor {
	return NewAuthInterceptor(authUsecase).RequireAuth()
}

// NewCORSHandler creates a CORS handler for Connect-RPC
func NewCORSHandler() connect.HandlerOption {
	return connect.WithInterceptors(
		connect.UnaryInterceptorFunc(func(next connect.UnaryFunc) connect.UnaryFunc {
			return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
				return next(ctx, req)
			}
		}),
	)
}

// GetUserFromContext extracts the user from context
func GetUserFromContext(ctx context.Context) (string, bool) {
	user, ok := ctx.Value(userContextKey).(string)
	return user, ok
}
