package delivery

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"connectrpc.com/connect"
	homev1 "github.com/frozenfish/fish-website/gen/go/home/v1"
	"github.com/frozenfish/fish-website/gen/go/home/v1/homev1connect"
	"github.com/frozenfish/fish-website/internal/domain"
	identityapplication "github.com/frozenfish/fish-website/internal/identity/application"
	identitydomain "github.com/frozenfish/fish-website/internal/identity/domain"
	"github.com/frozenfish/fish-website/internal/middleware"
	"github.com/frozenfish/fish-website/internal/usecase"
	"github.com/frozenfish/fish-website/pkg/logger"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Handler implements all Connect-RPC handlers
type Handler struct {
	authenticator   *identityapplication.OwnerAuthenticator
	loginLimiter    *loginRateLimiter
	postUsecase     *usecase.PostUsecase
	blogUsecase     *usecase.BlogUsecase
	albumUsecase    *usecase.AlbumUsecase
	settingsUsecase *usecase.SettingsUsecase
	projectUsecase  *usecase.ProjectUsecase
	aboutUsecase    *usecase.AboutUsecase
	githubUsecase   *usecase.GitHubUsecase
}

// NewHandler creates a new Handler
func NewHandler(
	authenticator *identityapplication.OwnerAuthenticator,
	postUsecase *usecase.PostUsecase,
	blogUsecase *usecase.BlogUsecase,
	albumUsecase *usecase.AlbumUsecase,
	settingsUsecase *usecase.SettingsUsecase,
	projectUsecase *usecase.ProjectUsecase,
	aboutUsecase *usecase.AboutUsecase,
	githubUsecase *usecase.GitHubUsecase,
) *Handler {
	logger.Info("initializing Connect-RPC handler")
	return &Handler{
		authenticator:   authenticator,
		loginLimiter:    newLoginRateLimiter(),
		postUsecase:     postUsecase,
		blogUsecase:     blogUsecase,
		albumUsecase:    albumUsecase,
		settingsUsecase: settingsUsecase,
		projectUsecase:  projectUsecase,
		aboutUsecase:    aboutUsecase,
		githubUsecase:   githubUsecase,
	}
}

// NewAuthServiceHandler creates a new AuthService handler
func (h *Handler) NewAuthServiceHandler() (string, http.Handler) {
	return homev1connect.NewAuthServiceHandler(h)
}

// NewPostServiceHandler creates a new PostService handler
func (h *Handler) NewPostServiceHandler() (string, http.Handler) {
	return homev1connect.NewPostServiceHandler(h)
}

// NewBlogServiceHandler creates a new BlogService handler
func (h *Handler) NewBlogServiceHandler() (string, http.Handler) {
	return homev1connect.NewBlogServiceHandler(h)
}

// NewAlbumServiceHandler creates a new AlbumService handler
func (h *Handler) NewAlbumServiceHandler() (string, http.Handler) {
	return homev1connect.NewAlbumServiceHandler(h)
}

// NewSettingsServiceHandler creates a new SettingsService handler
func (h *Handler) NewSettingsServiceHandler() (string, http.Handler) {
	return homev1connect.NewSettingsServiceHandler(h)
}

func (h *Handler) NewProjectServiceHandler() (string, http.Handler) {
	return homev1connect.NewProjectServiceHandler(h)
}

func (h *Handler) NewAboutServiceHandler() (string, http.Handler) {
	return homev1connect.NewAboutServiceHandler(h)
}

func (h *Handler) NewGitHubServiceHandler() (string, http.Handler) {
	return homev1connect.NewGitHubServiceHandler(h)
}

func (h *Handler) GetActivity(ctx context.Context, _ *connect.Request[homev1.GetActivityRequest]) (*connect.Response[homev1.GetActivityResponse], error) {
	activity, err := h.githubUsecase.GetActivity(ctx)
	if err != nil {
		logger.Error("GetGitHubActivity failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeUnavailable, err)
	}
	return connect.NewResponse(&homev1.GetActivityResponse{Activity: toProtoGitHubActivity(activity)}), nil
}

// Login authenticates a user
func (h *Handler) Login(ctx context.Context, req *connect.Request[homev1.LoginRequest]) (*connect.Response[homev1.LoginResponse], error) {
	logger.Info("received Login request", logger.String("username", req.Msg.Username))
	loginKey := loginRateLimitKey(req.Msg.Username, req.Header())
	if !h.loginLimiter.allow(loginKey) {
		logger.Warn("login rate limit reached", logger.String("username", req.Msg.Username))
		return nil, connect.NewError(connect.CodeResourceExhausted, errors.New("too many login attempts; try again later"))
	}

	token, expiresAt, err := h.authenticator.Login(ctx, req.Msg.Username, req.Msg.Password)
	if err != nil {
		if errors.Is(err, identitydomain.ErrInvalidCredentials) {
			h.loginLimiter.recordFailure(loginKey)
			logger.Warn("login failed: invalid password", logger.String("username", req.Msg.Username))
			return nil, connect.NewError(connect.CodePermissionDenied, err)
		}
		logger.Error("login failed with internal error", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	h.loginLimiter.reset(loginKey)

	logger.Info("login successful", logger.String("username", req.Msg.Username))
	response := connect.NewResponse(&homev1.LoginResponse{
		Token:     token,
		ExpiresAt: timestamppb.New(expiresAt),
	})
	refreshToken, _, err := h.authenticator.IssueRefreshToken()
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	setRefreshCookie(response.Header(), refreshToken, isSecureRequest(req.Header()))
	return response, nil
}

// Refresh exchanges the HttpOnly refresh cookie for a new access token.
func (h *Handler) Refresh(ctx context.Context, req *connect.Request[homev1.RefreshRequest]) (*connect.Response[homev1.RefreshResponse], error) {
	cookie, err := (&http.Request{Header: req.Header()}).Cookie("fish_refresh_token")
	if err != nil || cookie.Value == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("refresh token required"))
	}
	token, expiresAt, err := h.authenticator.Refresh(ctx, cookie.Value)
	if err != nil {
		if errors.Is(err, identitydomain.ErrTokenExpired) || errors.Is(err, identitydomain.ErrInvalidToken) {
			return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("refresh token expired"))
		}
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	newRefreshToken, _, err := h.authenticator.IssueRefreshToken()
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	response := connect.NewResponse(&homev1.RefreshResponse{Token: token, ExpiresAt: timestamppb.New(expiresAt)})
	setRefreshCookie(response.Header(), newRefreshToken, isSecureRequest(req.Header()))
	return response, nil
}

// Logout removes the browser refresh cookie. Access tokens remain short-lived
// and are discarded by the client immediately.
func (h *Handler) Logout(_ context.Context, req *connect.Request[homev1.LogoutRequest]) (*connect.Response[homev1.LogoutResponse], error) {
	response := connect.NewResponse(&homev1.LogoutResponse{})
	parts := []string{"fish_refresh_token=", "Path=/api/home.v1.AuthService", "Max-Age=0", "HttpOnly", "SameSite=Lax"}
	if isSecureRequest(req.Header()) {
		parts = append(parts, "Secure")
	}
	response.Header().Set("Set-Cookie", strings.Join(parts, "; "))
	return response, nil
}

func setRefreshCookie(headers http.Header, value string, secure bool) {
	parts := []string{"fish_refresh_token=" + value, "Path=/api/home.v1.AuthService", "Max-Age=2592000", "HttpOnly", "SameSite=Lax"}
	if secure {
		parts = append(parts, "Secure")
	}
	headers.Add("Set-Cookie", strings.Join(parts, "; "))
}

func isSecureRequest(headers http.Header) bool {
	origin := headers.Get("Origin")
	return origin == "" || !strings.HasPrefix(origin, "http://localhost") && !strings.HasPrefix(origin, "http://127.0.0.1")
}

// CreatePost creates a new post
func (h *Handler) CreatePost(ctx context.Context, req *connect.Request[homev1.CreatePostRequest]) (*connect.Response[homev1.CreatePostResponse], error) {
	logger.Info("received CreatePost request", logger.Int("image_count", len(req.Msg.ImageIds)))

	post, err := h.postUsecase.CreatePost(ctx, req.Msg.Content, req.Msg.ImageIds)
	if err != nil {
		logger.Error("CreatePost failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("CreatePost successful", logger.String("post_id", post.ID))
	return connect.NewResponse(&homev1.CreatePostResponse{
		Post: toProtoPost(post),
	}), nil
}

// ListPosts lists posts
func (h *Handler) ListPosts(ctx context.Context, req *connect.Request[homev1.ListPostsRequest]) (*connect.Response[homev1.ListPostsResponse], error) {
	logger.Debug("received ListPosts request", logger.Int("page_size", int(req.Msg.PageSize)), logger.String("page_token", req.Msg.PageToken))

	posts, nextPageToken, hasMore, err := h.postUsecase.ListPosts(ctx, int(req.Msg.PageSize), req.Msg.PageToken)
	if err != nil {
		logger.Error("ListPosts failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Debug("ListPosts successful", logger.Int("post_count", len(posts)), logger.Bool("has_more", hasMore))

	protoPosts := make([]*homev1.Post, len(posts))
	for i, post := range posts {
		protoPosts[i] = toProtoPost(post)
	}

	return connect.NewResponse(&homev1.ListPostsResponse{
		Posts:         protoPosts,
		NextPageToken: nextPageToken,
		HasMore:       hasMore,
	}), nil
}

// GetPost gets one post
func (h *Handler) GetPost(ctx context.Context, req *connect.Request[homev1.GetPostRequest]) (*connect.Response[homev1.GetPostResponse], error) {
	logger.Debug("received GetPost request", logger.String("post_id", req.Msg.Id))

	post, err := h.postUsecase.GetPost(ctx, req.Msg.Id)
	if err != nil {
		logger.Error("GetPost failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.GetPostResponse{Post: toProtoPost(post)}), nil
}

// UpdatePost updates one post
func (h *Handler) UpdatePost(ctx context.Context, req *connect.Request[homev1.UpdatePostRequest]) (*connect.Response[homev1.UpdatePostResponse], error) {
	logger.Info("received UpdatePost request", logger.String("post_id", req.Msg.Id), logger.Int("image_count", len(req.Msg.ImageUrls)))

	post, err := h.postUsecase.UpdatePost(ctx, req.Msg.Id, req.Msg.Content, req.Msg.ImageUrls)
	if err != nil {
		logger.Error("UpdatePost failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.UpdatePostResponse{Post: toProtoPost(post)}), nil
}

// DeletePost deletes a post
func (h *Handler) DeletePost(ctx context.Context, req *connect.Request[homev1.DeletePostRequest]) (*connect.Response[homev1.DeletePostResponse], error) {
	logger.Info("received DeletePost request", logger.String("post_id", req.Msg.Id))

	err := h.postUsecase.DeletePost(ctx, req.Msg.Id)
	if err != nil {
		logger.Error("DeletePost failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("DeletePost successful", logger.String("post_id", req.Msg.Id))
	return connect.NewResponse(&homev1.DeletePostResponse{}), nil
}

// CreateArticle creates a new article
func (h *Handler) CreateArticle(ctx context.Context, req *connect.Request[homev1.CreateArticleRequest]) (*connect.Response[homev1.CreateArticleResponse], error) {
	logger.Info("received CreateArticle request", logger.String("title", req.Msg.Title), logger.Int("tag_count", len(req.Msg.Tags)))

	article, err := h.blogUsecase.CreateArticle(ctx, req.Msg.Title, req.Msg.Content, req.Msg.FolderId, req.Msg.Tags, fromProtoArticleStatus(req.Msg.Status))
	if err != nil {
		logger.Error("CreateArticle failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("CreateArticle successful", logger.String("article_id", article.ID))
	return connect.NewResponse(&homev1.CreateArticleResponse{
		Article: toProtoArticle(article),
	}), nil
}

// UpdateArticle updates an article
func (h *Handler) UpdateArticle(ctx context.Context, req *connect.Request[homev1.UpdateArticleRequest]) (*connect.Response[homev1.UpdateArticleResponse], error) {
	logger.Info("received UpdateArticle request", logger.String("article_id", req.Msg.ArticleId))

	article, err := h.blogUsecase.UpdateArticle(
		ctx,
		req.Msg.ArticleId,
		req.Msg.Title,
		req.Msg.Content,
		req.Msg.FolderId,
		req.Msg.Tags,
		fromProtoArticleStatus(req.Msg.Status),
	)
	if err != nil {
		logger.Error("UpdateArticle failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.UpdateArticleResponse{Article: toProtoArticle(article)}), nil
}

// DeleteArticle deletes an article
func (h *Handler) DeleteArticle(ctx context.Context, req *connect.Request[homev1.DeleteArticleRequest]) (*connect.Response[homev1.DeleteArticleResponse], error) {
	logger.Info("received DeleteArticle request", logger.String("article_id", req.Msg.ArticleId))

	if err := h.blogUsecase.DeleteArticle(ctx, req.Msg.ArticleId); err != nil {
		logger.Error("DeleteArticle failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.DeleteArticleResponse{}), nil
}

// ListArticles lists articles
func (h *Handler) ListArticles(ctx context.Context, req *connect.Request[homev1.ListArticlesRequest]) (*connect.Response[homev1.ListArticlesResponse], error) {
	logger.Debug("received ListArticles request",
		logger.Int("page_size", int(req.Msg.PageSize)),
		logger.String("page_token", req.Msg.PageToken),
		logger.String("folder_id", req.Msg.FolderId),
		logger.String("tag", req.Msg.Tag),
		logger.String("status", fromProtoArticleStatus(req.Msg.Status)))

	status := fromProtoArticleStatus(req.Msg.Status)
	if _, authenticated := middleware.GetUserFromContext(ctx); !authenticated {
		// Anonymous readers can only see published content, even if they send a
		// draft/all status filter to this public procedure.
		status = "published"
	}
	articles, nextPageToken, hasMore, folders, err := h.blogUsecase.ListArticles(ctx, int(req.Msg.PageSize), req.Msg.PageToken, req.Msg.FolderId, req.Msg.Tag, status)
	if err != nil {
		logger.Error("ListArticles failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Debug("ListArticles successful", logger.Int("article_count", len(articles)), logger.Int("folder_count", len(folders)))

	protoArticles := make([]*homev1.Article, len(articles))
	for i, article := range articles {
		protoArticles[i] = toProtoArticle(article)
	}

	protoFolders := make([]*homev1.Folder, len(folders))
	for i, folder := range folders {
		protoFolders[i] = toProtoFolder(folder)
	}

	return connect.NewResponse(&homev1.ListArticlesResponse{
		Articles:      protoArticles,
		NextPageToken: nextPageToken,
		HasMore:       hasMore,
		Folders:       protoFolders,
	}), nil
}

// GetArticle gets an article
func (h *Handler) GetArticle(ctx context.Context, req *connect.Request[homev1.GetArticleRequest]) (*connect.Response[homev1.GetArticleResponse], error) {
	logger.Debug("received GetArticle request", logger.String("article_id", req.Msg.ArticleId))

	article, err := h.blogUsecase.GetArticle(ctx, req.Msg.ArticleId)
	if err != nil {
		logger.Error("GetArticle failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if article.Status == "draft" {
		if _, authenticated := middleware.GetUserFromContext(ctx); !authenticated {
			return nil, connect.NewError(connect.CodeNotFound, errors.New("article not found"))
		}
	}

	logger.Debug("GetArticle successful", logger.String("article_id", article.ID))
	return connect.NewResponse(&homev1.GetArticleResponse{
		Article: toProtoArticle(article),
	}), nil
}

// CreateFolder creates a blog folder
func (h *Handler) CreateFolder(ctx context.Context, req *connect.Request[homev1.CreateFolderRequest]) (*connect.Response[homev1.CreateFolderResponse], error) {
	logger.Info("received CreateFolder request", logger.String("name", req.Msg.Name), logger.String("parent_folder_id", req.Msg.ParentFolderId))

	folder, err := h.blogUsecase.CreateFolder(ctx, req.Msg.Name, req.Msg.ParentFolderId)
	if err != nil {
		logger.Error("CreateFolder failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.CreateFolderResponse{Folder: toProtoFolder(folder)}), nil
}

// UpdateFolder updates folder hierarchy
func (h *Handler) UpdateFolder(ctx context.Context, req *connect.Request[homev1.UpdateFolderRequest]) (*connect.Response[homev1.UpdateFolderResponse], error) {
	logger.Info("received UpdateFolder request", logger.String("folder_id", req.Msg.FolderId), logger.String("parent_folder_id", req.Msg.ParentFolderId))

	folder, err := h.blogUsecase.UpdateFolder(ctx, req.Msg.FolderId, req.Msg.Name, req.Msg.ParentFolderId)
	if err != nil {
		logger.Error("UpdateFolder failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.UpdateFolderResponse{Folder: toProtoFolder(folder)}), nil
}

// DeleteFolder deletes a folder and moves nested articles to root
func (h *Handler) DeleteFolder(ctx context.Context, req *connect.Request[homev1.DeleteFolderRequest]) (*connect.Response[homev1.DeleteFolderResponse], error) {
	logger.Info("received DeleteFolder request", logger.String("folder_id", req.Msg.FolderId))

	if err := h.blogUsecase.DeleteFolder(ctx, req.Msg.FolderId); err != nil {
		logger.Error("DeleteFolder failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.DeleteFolderResponse{}), nil
}

// CreateAlbum creates an album
func (h *Handler) CreateAlbum(ctx context.Context, req *connect.Request[homev1.CreateAlbumRequest]) (*connect.Response[homev1.CreateAlbumResponse], error) {
	logger.Info("received CreateAlbum request", logger.String("name", req.Msg.Name), logger.Bool("is_public", req.Msg.IsPublic))

	album, err := h.albumUsecase.CreateAlbum(ctx, req.Msg.Name, req.Msg.Description, req.Msg.IsPublic)
	if err != nil {
		logger.Error("CreateAlbum failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("CreateAlbum successful", logger.String("album_id", album.ID))
	return connect.NewResponse(&homev1.CreateAlbumResponse{
		Album: toProtoAlbum(album),
	}), nil
}

// ListAlbums lists albums
func (h *Handler) ListAlbums(ctx context.Context, req *connect.Request[homev1.ListAlbumsRequest]) (*connect.Response[homev1.ListAlbumsResponse], error) {
	logger.Debug("received ListAlbums request",
		logger.Int("page_size", int(req.Msg.PageSize)),
		logger.String("page_token", req.Msg.PageToken),
		logger.Bool("only_public", req.Msg.OnlyPublic))

	_, isAuthed := middleware.GetUserFromContext(ctx)
	onlyPublic := req.Msg.OnlyPublic || !isAuthed

	albums, nextPageToken, hasMore, err := h.albumUsecase.ListAlbums(ctx, int(req.Msg.PageSize), req.Msg.PageToken, onlyPublic)
	if err != nil {
		logger.Error("ListAlbums failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	protoAlbums := make([]*homev1.Album, len(albums))
	for i, album := range albums {
		protoAlbums[i] = toProtoAlbum(album)
	}

	return connect.NewResponse(&homev1.ListAlbumsResponse{
		Albums:        protoAlbums,
		NextPageToken: nextPageToken,
		HasMore:       hasMore,
	}), nil
}

// GetAlbum gets one album with images
func (h *Handler) GetAlbum(ctx context.Context, req *connect.Request[homev1.GetAlbumRequest]) (*connect.Response[homev1.GetAlbumResponse], error) {
	logger.Debug("received GetAlbum request", logger.String("album_id", req.Msg.AlbumId))

	_, isAuthed := middleware.GetUserFromContext(ctx)
	album, images, err := h.albumUsecase.GetAlbumWithImages(ctx, req.Msg.AlbumId, isAuthed)
	if err != nil {
		if errors.Is(err, domain.ErrUnauthorized) {
			return nil, connect.NewError(connect.CodePermissionDenied, err)
		}
		logger.Error("GetAlbum failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	protoImages := make([]*homev1.Image, len(images))
	for i, image := range images {
		protoImages[i] = toProtoImage(image)
	}

	return connect.NewResponse(&homev1.GetAlbumResponse{
		Album:  toProtoAlbum(album),
		Images: protoImages,
	}), nil
}

// UploadImageRequest gets a presigned upload URL
func (h *Handler) UploadImageRequest(ctx context.Context, req *connect.Request[homev1.UploadImageRequestRequest]) (*connect.Response[homev1.UploadImageRequestResponse], error) {
	logger.Info("received UploadImageRequest request",
		logger.String("album_id", req.Msg.AlbumId),
		logger.String("file_name", req.Msg.FileName),
		logger.String("mime_type", req.Msg.MimeType),
		logger.Int64("file_size", req.Msg.FileSize))

	uploadURL, imageID, headers, expiresAt, err := h.albumUsecase.GetPresignedUploadURL(
		ctx,
		req.Msg.AlbumId,
		req.Msg.FileName,
		req.Msg.MimeType,
		req.Msg.FileSize,
	)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidImageUpload) {
			return nil, connect.NewError(connect.CodeInvalidArgument, err)
		}
		logger.Error("UploadImageRequest failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("UploadImageRequest successful", logger.String("image_id", imageID))
	return connect.NewResponse(&homev1.UploadImageRequestResponse{
		UploadUrl: uploadURL,
		ImageId:   imageID,
		Headers:   headers,
		ExpiresAt: timestamppb.New(expiresAt),
	}), nil
}

// ConfirmImageUpload confirms image upload
func (h *Handler) ConfirmImageUpload(ctx context.Context, req *connect.Request[homev1.ConfirmImageUploadRequest]) (*connect.Response[homev1.ConfirmImageUploadResponse], error) {
	logger.Info("received ConfirmImageUpload request", logger.String("image_id", req.Msg.ImageId))

	image, err := h.albumUsecase.ConfirmImageUpload(ctx, req.Msg.ImageId, req.Msg.UploadUrl)
	if err != nil {
		if errors.Is(err, domain.ErrImageNotUploaded) {
			logger.Warn("ConfirmImageUpload failed: image not uploaded", logger.String("image_id", req.Msg.ImageId))
			return nil, connect.NewError(connect.CodeFailedPrecondition, err)
		}
		if errors.Is(err, domain.ErrImageUploadMismatch) {
			return nil, connect.NewError(connect.CodeFailedPrecondition, err)
		}
		logger.Error("ConfirmImageUpload failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("ConfirmImageUpload successful", logger.String("image_id", image.ID), logger.String("url", image.URL))
	return connect.NewResponse(&homev1.ConfirmImageUploadResponse{
		Image: toProtoImage(image),
	}), nil
}

// UpdateAlbum updates album metadata.
func (h *Handler) UpdateAlbum(ctx context.Context, req *connect.Request[homev1.UpdateAlbumRequest]) (*connect.Response[homev1.UpdateAlbumResponse], error) {
	logger.Info("received UpdateAlbum request", logger.String("album_id", req.Msg.AlbumId))

	album, err := h.albumUsecase.UpdateAlbum(ctx, req.Msg.AlbumId, req.Msg.Name, req.Msg.Description, req.Msg.IsPublic)
	if err != nil {
		logger.Error("UpdateAlbum failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.UpdateAlbumResponse{Album: toProtoAlbum(album)}), nil
}

// MoveImages moves images across albums while preserving upload time.
func (h *Handler) MoveImages(ctx context.Context, req *connect.Request[homev1.MoveImagesRequest]) (*connect.Response[homev1.MoveImagesResponse], error) {
	logger.Info("received MoveImages request",
		logger.String("from_album_id", req.Msg.FromAlbumId),
		logger.String("target_album_id", req.Msg.TargetAlbumId),
		logger.Int("image_count", len(req.Msg.ImageIds)))

	movedCount, err := h.albumUsecase.MoveImages(ctx, req.Msg.FromAlbumId, req.Msg.TargetAlbumId, req.Msg.ImageIds)
	if err != nil {
		logger.Error("MoveImages failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.MoveImagesResponse{MovedCount: int32(movedCount)}), nil
}

// SetImageDate assigns a calendar date used for album timeline grouping.
func (h *Handler) SetImageDate(ctx context.Context, req *connect.Request[homev1.SetImageDateRequest]) (*connect.Response[homev1.SetImageDateResponse], error) {
	updatedCount, err := h.albumUsecase.SetImageDate(ctx, req.Msg.AlbumId, req.Msg.ImageIds, req.Msg.PhotoDate)
	if err != nil {
		logger.Error("SetImageDate failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}
	return connect.NewResponse(&homev1.SetImageDateResponse{UpdatedCount: int32(updatedCount)}), nil
}

// AnalyzeImageReferences analyzes image references in an album.
func (h *Handler) AnalyzeImageReferences(ctx context.Context, req *connect.Request[homev1.AnalyzeImageReferencesRequest]) (*connect.Response[homev1.AnalyzeImageReferencesResponse], error) {
	logger.Info("received AnalyzeImageReferences request", logger.String("album_id", req.Msg.AlbumId))

	records, summary, err := h.albumUsecase.AnalyzeImageReferences(ctx, req.Msg.AlbumId)
	if err != nil {
		logger.Error("AnalyzeImageReferences failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	protoRefs := make([]*homev1.ImageReference, len(records))
	for i, rec := range records {
		protoRefs[i] = &homev1.ImageReference{
			ImageId:                  rec.ImageID,
			Url:                      rec.URL,
			FileName:                 rec.FileName,
			ReferenceCount:           int32(rec.ReferenceCount),
			PostReferenceCount:       int32(rec.PostReferenceCount),
			BlogReferenceCount:       int32(rec.BlogReferenceCount),
			AvatarReferenceCount:     int32(rec.AvatarRefCount),
			BackgroundReferenceCount: int32(rec.BackgroundRefCount),
			FaviconReferenceCount:    int32(rec.FaviconRefCount),
			SafeToDelete:             rec.ReferenceCount == 0,
		}
	}

	return connect.NewResponse(&homev1.AnalyzeImageReferencesResponse{
		References:          protoRefs,
		TotalImages:         int32(summary.TotalImages),
		DeletableImages:     int32(summary.DeletableImages),
		ReferencedImages:    int32(summary.ReferencedImages),
		TotalReferenceCount: int32(summary.TotalRefCount),
	}), nil
}

// RepairImageReferences rebuilds reference counters from source data.
func (h *Handler) RepairImageReferences(ctx context.Context, req *connect.Request[homev1.RepairImageReferencesRequest]) (*connect.Response[homev1.RepairImageReferencesResponse], error) {
	logger.Info("received RepairImageReferences request")

	result, err := h.albumUsecase.RepairImageReferenceConsistency(ctx)
	if err != nil {
		logger.Error("RepairImageReferences failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.RepairImageReferencesResponse{
		ProcessedImages:     int32(result.ProcessedImages),
		ReferencedImages:    int32(result.ReferencedImages),
		TotalReferenceCount: int32(result.TotalRefCount),
		RepairedAt:          timestamppb.New(result.RepairedAt),
	}), nil
}

// DeleteImages moves images to recycle bin (or permanently deletes when in recycle bin).
func (h *Handler) DeleteImages(ctx context.Context, req *connect.Request[homev1.DeleteImagesRequest]) (*connect.Response[homev1.DeleteImagesResponse], error) {
	logger.Info("received DeleteImages request",
		logger.String("album_id", req.Msg.AlbumId),
		logger.Int("image_count", len(req.Msg.ImageIds)))

	deletedCount, scheduledAt, err := h.albumUsecase.DeleteImages(ctx, req.Msg.AlbumId, req.Msg.ImageIds)
	if err != nil {
		logger.Error("DeleteImages failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.DeleteImagesResponse{
		DeletedCount:      int32(deletedCount),
		ScheduledDeleteAt: timestamppb.New(scheduledAt),
	}), nil
}

// DeleteAlbum deletes an album. Deleting recycle bin means permanent deletion.
func (h *Handler) DeleteAlbum(ctx context.Context, req *connect.Request[homev1.DeleteAlbumRequest]) (*connect.Response[homev1.DeleteAlbumResponse], error) {
	logger.Info("received DeleteAlbum request", logger.String("album_id", req.Msg.AlbumId))

	if err := h.albumUsecase.DeleteAlbum(ctx, req.Msg.AlbumId); err != nil {
		logger.Error("DeleteAlbum failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.DeleteAlbumResponse{}), nil
}

// GetSettings gets settings
func (h *Handler) GetSettings(ctx context.Context, req *connect.Request[homev1.GetSettingsRequest]) (*connect.Response[homev1.GetSettingsResponse], error) {
	logger.Debug("received GetSettings request")

	settings, err := h.settingsUsecase.GetSettings(ctx)
	if err != nil {
		logger.Error("GetSettings failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Debug("GetSettings successful")
	return connect.NewResponse(&homev1.GetSettingsResponse{
		Settings: toProtoSettings(settings),
	}), nil
}

// UpdateSettings updates settings
func (h *Handler) UpdateSettings(ctx context.Context, req *connect.Request[homev1.UpdateSettingsRequest]) (*connect.Response[homev1.UpdateSettingsResponse], error) {
	logger.Info("received UpdateSettings request", logger.Strings("update_mask", req.Msg.UpdateMask))

	settings := fromProtoSettings(req.Msg.Settings)
	updated, err := h.settingsUsecase.UpdateSettings(ctx, settings, req.Msg.UpdateMask)
	if err != nil {
		logger.Error("UpdateSettings failed", logger.Err(err))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("UpdateSettings successful")
	return connect.NewResponse(&homev1.UpdateSettingsResponse{
		Settings: toProtoSettings(updated),
	}), nil
}

// Conversion functions
func toProtoPost(p *domain.Post) *homev1.Post {
	return &homev1.Post{
		Id:        p.ID,
		Content:   p.Content,
		ImageUrls: p.ImageURLs,
		CreatedAt: timestamppb.New(p.CreatedAt),
		UpdatedAt: timestamppb.New(p.UpdatedAt),
	}
}

func toProtoArticle(a *domain.Article) *homev1.Article {
	return &homev1.Article{
		Id:        a.ID,
		Title:     a.Title,
		Content:   a.Content,
		FolderId:  a.FolderID,
		Tags:      a.Tags,
		CreatedAt: timestamppb.New(a.CreatedAt),
		UpdatedAt: timestamppb.New(a.UpdatedAt),
		Status:    toProtoArticleStatus(a.Status),
	}
}

func toProtoArticleStatus(status string) homev1.ArticleStatus {
	switch status {
	case "draft":
		return homev1.ArticleStatus_ARTICLE_STATUS_DRAFT
	case "published":
		return homev1.ArticleStatus_ARTICLE_STATUS_PUBLISHED
	default:
		return homev1.ArticleStatus_ARTICLE_STATUS_UNSPECIFIED
	}
}

func fromProtoArticleStatus(status homev1.ArticleStatus) string {
	switch status {
	case homev1.ArticleStatus_ARTICLE_STATUS_DRAFT:
		return "draft"
	case homev1.ArticleStatus_ARTICLE_STATUS_PUBLISHED:
		return "published"
	case homev1.ArticleStatus_ARTICLE_STATUS_UNSPECIFIED:
		// UNSPECIFIED means no filter for authenticated article management.
		// Anonymous requests are narrowed to published in ListArticles above.
		return ""
	default:
		return ""
	}
}

func toProtoFolder(f *domain.Folder) *homev1.Folder {
	children := make([]*homev1.Folder, len(f.Children))
	for i, child := range f.Children {
		children[i] = toProtoFolder(child)
	}
	return &homev1.Folder{
		Id:             f.ID,
		Name:           f.Name,
		ParentFolderId: f.ParentFolderID,
		Children:       children,
	}
}

func toProtoAlbum(a *domain.Album) *homev1.Album {
	return &homev1.Album{
		Id:          a.ID,
		Name:        a.Name,
		Description: a.Description,
		IsPublic:    a.IsPublic,
		CreatedAt:   timestamppb.New(a.CreatedAt),
	}
}

func toProtoImage(i *domain.Image) *homev1.Image {
	photoDate := ""
	if i.PhotoDate != nil {
		photoDate = i.PhotoDate.Format("2006-01-02")
	}
	return &homev1.Image{
		Id:           i.ID,
		AlbumId:      i.AlbumID,
		Url:          i.URL,
		ThumbnailUrl: i.ThumbnailURL,
		FileName:     i.FileName,
		FileSize:     i.FileSize,
		MimeType:     i.MimeType,
		CreatedAt:    timestamppb.New(i.CreatedAt),
		PhotoDate:    photoDate,
	}
}

func toProtoSettings(s *domain.Settings) *homev1.Settings {
	return &homev1.Settings{
		DisplayName:            s.DisplayName,
		Bio:                    s.Bio,
		AvatarUrl:              s.AvatarURL,
		TwitterUrl:             s.TwitterURL,
		GithubUrl:              s.GitHubURL,
		BilibiliUrl:            s.BilibiliURL,
		CustomLinks:            s.CustomLinks,
		BackgroundImageUrl:     s.BackgroundImageURL,
		SakuraParticlesEnabled: s.SakuraParticlesEnabled,
		ThemeColor:             s.ThemeColor,
		UpdatedAt:              timestamppb.New(s.UpdatedAt),
	}
}

func fromProtoSettings(s *homev1.Settings) *domain.Settings {
	return &domain.Settings{
		DisplayName:            s.DisplayName,
		Bio:                    s.Bio,
		AvatarURL:              s.AvatarUrl,
		TwitterURL:             s.TwitterUrl,
		GitHubURL:              s.GithubUrl,
		BilibiliURL:            s.BilibiliUrl,
		CustomLinks:            s.CustomLinks,
		BackgroundImageURL:     s.BackgroundImageUrl,
		SakuraParticlesEnabled: s.SakuraParticlesEnabled,
		ThemeColor:             s.ThemeColor,
	}
}
