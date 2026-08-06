package middleware

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"connectrpc.com/connect"
	identityapplication "github.com/frozenfish/fish-website/internal/identity/application"
	identitydomain "github.com/frozenfish/fish-website/internal/identity/domain"
)

type contextKey string

const userContextKey contextKey = "user"

// AuthInterceptor is a Connect-RPC interceptor for JWT authentication
type AuthInterceptor struct {
	authenticator *identityapplication.OwnerAuthenticator
}

// NewAuthInterceptor creates a new AuthInterceptor
func NewAuthInterceptor(authenticator *identityapplication.OwnerAuthenticator) *AuthInterceptor {
	return &AuthInterceptor{authenticator: authenticator}
}

// RequireAuth is an interceptor that requires valid JWT authentication
func (i *AuthInterceptor) RequireAuth() connect.Interceptor {
	return connect.UnaryInterceptorFunc(func(next connect.UnaryFunc) connect.UnaryFunc {
		return connect.UnaryFunc(func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			// Skip auth for specified procedures
			if isPublicProcedure(req.Spec().Procedure) {
				ctx = i.attachOptionalUser(ctx, req.Header())
				return next(ctx, req)
			}

			token, err := extractToken(req.Header())
			if err != nil {
				return nil, connect.NewError(connect.CodeUnauthenticated, err)
			}

			user, err := i.authenticator.ValidateToken(ctx, token)
			if err != nil {
				if errors.Is(err, identitydomain.ErrTokenExpired) {
					return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("token expired"))
				}
				return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid token"))
			}
			// Add user to context
			ctx = context.WithValue(ctx, userContextKey, user)

			return next(ctx, req)
		})
	})
}

// attachOptionalUser tries to authenticate bearer token for public endpoints.
// It never returns an error: invalid/missing tokens are treated as anonymous.
func (i *AuthInterceptor) attachOptionalUser(ctx context.Context, headers http.Header) context.Context {
	authHeader := headers.Get("Authorization")
	if authHeader == "" {
		return ctx
	}

	token, err := extractToken(headers)
	if err != nil {
		return ctx
	}

	user, err := i.authenticator.ValidateToken(ctx, token)
	if err != nil {
		return ctx
	}

	return context.WithValue(ctx, userContextKey, user)
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
	"/home.v1.AuthService/Login":           true,
	"/home.v1.AuthService/Refresh":         true,
	"/home.v1.AuthService/Logout":          true,
	"/home.v1.PostService/ListPosts":       true,
	"/home.v1.PostService/GetPost":         true,
	"/home.v1.BlogService/ListArticles":    true,
	"/home.v1.BlogService/GetArticle":      true,
	"/home.v1.AlbumService/ListAlbums":     true,
	"/home.v1.AlbumService/GetAlbum":       true,
	"/home.v1.SettingsService/GetSettings": true,
	"/home.v1.ProjectService/ListProjects": true,
	"/home.v1.ProjectService/GetProject": true,
	"/home.v1.AboutService/GetAbout": true,
}

func isPublicProcedure(procedure string) bool {
	return publicProcedures[procedure]
}

// NewAuthRequiredInterceptor creates an interceptor that requires auth for all non-public procedures
func NewAuthRequiredInterceptor(authenticator *identityapplication.OwnerAuthenticator) connect.Interceptor {
	return NewAuthInterceptor(authenticator).RequireAuth()
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
