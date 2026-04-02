package delivery

import (
	"context"
	"errors"
	"net/http"

	"connectrpc.com/connect"
	homev1 "github.com/frozenfish/fish-website/gen/go/home/v1"
	"github.com/frozenfish/fish-website/gen/go/home/v1/homev1connect"
	"github.com/frozenfish/fish-website/internal/domain"
	"github.com/frozenfish/fish-website/internal/usecase"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Handler implements all Connect-RPC handlers
type Handler struct {
	authUsecase     *usecase.AuthUsecase
	postUsecase     *usecase.PostUsecase
	blogUsecase     *usecase.BlogUsecase
	albumUsecase    *usecase.AlbumUsecase
	settingsUsecase *usecase.SettingsUsecase
}

// NewHandler creates a new Handler
func NewHandler(
	authUsecase *usecase.AuthUsecase,
	postUsecase *usecase.PostUsecase,
	blogUsecase *usecase.BlogUsecase,
	albumUsecase *usecase.AlbumUsecase,
	settingsUsecase *usecase.SettingsUsecase,
) *Handler {
	return &Handler{
		authUsecase:     authUsecase,
		postUsecase:     postUsecase,
		blogUsecase:     blogUsecase,
		albumUsecase:    albumUsecase,
		settingsUsecase: settingsUsecase,
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

// Login authenticates a user
func (h *Handler) Login(ctx context.Context, req *connect.Request[homev1.LoginRequest]) (*connect.Response[homev1.LoginResponse], error) {
	token, expiresAt, err := h.authUsecase.Login(ctx, req.Msg.Username, req.Msg.Password)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidPassword) {
			return nil, connect.NewError(connect.CodePermissionDenied, err)
		}
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.LoginResponse{
		Token:     token,
		ExpiresAt: timestamppb.New(expiresAt),
	}), nil
}

// CreatePost creates a new post
func (h *Handler) CreatePost(ctx context.Context, req *connect.Request[homev1.CreatePostRequest]) (*connect.Response[homev1.CreatePostResponse], error) {
	post, err := h.postUsecase.CreatePost(ctx, req.Msg.Content, req.Msg.ImageIds)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.CreatePostResponse{
		Post: toProtoPost(post),
	}), nil
}

// ListPosts lists posts
func (h *Handler) ListPosts(ctx context.Context, req *connect.Request[homev1.ListPostsRequest]) (*connect.Response[homev1.ListPostsResponse], error) {
	posts, nextPageToken, hasMore, err := h.postUsecase.ListPosts(ctx, int(req.Msg.PageSize), req.Msg.PageToken)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

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

// CreateArticle creates a new article
func (h *Handler) CreateArticle(ctx context.Context, req *connect.Request[homev1.CreateArticleRequest]) (*connect.Response[homev1.CreateArticleResponse], error) {
	article, err := h.blogUsecase.CreateArticle(ctx, req.Msg.Title, req.Msg.Content, req.Msg.FolderId, req.Msg.Tags)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.CreateArticleResponse{
		Article: toProtoArticle(article),
	}), nil
}

// ListArticles lists articles
func (h *Handler) ListArticles(ctx context.Context, req *connect.Request[homev1.ListArticlesRequest]) (*connect.Response[homev1.ListArticlesResponse], error) {
	articles, nextPageToken, hasMore, folders, err := h.blogUsecase.ListArticles(ctx, int(req.Msg.PageSize), req.Msg.PageToken, req.Msg.FolderId, req.Msg.Tag)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

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
	article, err := h.blogUsecase.GetArticle(ctx, req.Msg.ArticleId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.GetArticleResponse{
		Article: toProtoArticle(article),
	}), nil
}

// CreateAlbum creates an album
func (h *Handler) CreateAlbum(ctx context.Context, req *connect.Request[homev1.CreateAlbumRequest]) (*connect.Response[homev1.CreateAlbumResponse], error) {
	album, err := h.albumUsecase.CreateAlbum(ctx, req.Msg.Name, req.Msg.Description, req.Msg.IsPublic)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.CreateAlbumResponse{
		Album: toProtoAlbum(album),
	}), nil
}

// UploadImageRequest gets a presigned upload URL
func (h *Handler) UploadImageRequest(ctx context.Context, req *connect.Request[homev1.UploadImageRequestRequest]) (*connect.Response[homev1.UploadImageRequestResponse], error) {
	uploadURL, imageID, headers, expiresAt, err := h.albumUsecase.GetPresignedUploadURL(
		ctx,
		req.Msg.AlbumId,
		req.Msg.FileName,
		req.Msg.MimeType,
		req.Msg.FileSize,
	)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.UploadImageRequestResponse{
		UploadUrl:  uploadURL,
		ImageId:    imageID,
		Headers:    headers,
		ExpiresAt:  timestamppb.New(expiresAt),
	}), nil
}

// ConfirmImageUpload confirms image upload
func (h *Handler) ConfirmImageUpload(ctx context.Context, req *connect.Request[homev1.ConfirmImageUploadRequest]) (*connect.Response[homev1.ConfirmImageUploadResponse], error) {
	image, err := h.albumUsecase.ConfirmImageUpload(ctx, req.Msg.ImageId, req.Msg.UploadUrl)
	if err != nil {
		if errors.Is(err, domain.ErrImageNotUploaded) {
			return nil, connect.NewError(connect.CodeFailedPrecondition, err)
		}
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.ConfirmImageUploadResponse{
		Image: toProtoImage(image),
	}), nil
}

// GetSettings gets settings
func (h *Handler) GetSettings(ctx context.Context, req *connect.Request[emptypb.Empty]) (*connect.Response[homev1.GetSettingsResponse], error) {
	settings, err := h.settingsUsecase.GetSettings(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&homev1.GetSettingsResponse{
		Settings: toProtoSettings(settings),
	}), nil
}

// UpdateSettings updates settings
func (h *Handler) UpdateSettings(ctx context.Context, req *connect.Request[homev1.UpdateSettingsRequest]) (*connect.Response[homev1.UpdateSettingsResponse], error) {
	settings := fromProtoSettings(req.Msg.Settings)
	updated, err := h.settingsUsecase.UpdateSettings(ctx, settings, req.Msg.UpdateMask)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

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
	return &homev1.Image{
		Id:           i.ID,
		AlbumId:      i.AlbumID,
		Url:          i.URL,
		ThumbnailUrl: i.ThumbnailURL,
		FileName:     i.FileName,
		FileSize:     i.FileSize,
		MimeType:     i.MimeType,
		CreatedAt:    timestamppb.New(i.CreatedAt),
	}
}

func toProtoSettings(s *domain.Settings) *homev1.Settings {
	return &homev1.Settings{
		DisplayName:           s.DisplayName,
		Bio:                 s.Bio,
		AvatarUrl:           s.AvatarURL,
		TwitterUrl:          s.TwitterURL,
		GithubUrl:           s.GitHubURL,
		BilibiliUrl:         s.BilibiliURL,
		CustomLinks:         s.CustomLinks,
		BackgroundImageUrl:  s.BackgroundImageURL,
		SakuraParticlesEnabled: s.SakuraParticlesEnabled,
		ThemeColor:          s.ThemeColor,
		UpdatedAt:           timestamppb.New(s.UpdatedAt),
	}
}

func fromProtoSettings(s *homev1.Settings) *domain.Settings {
	return &domain.Settings{
		DisplayName:         s.DisplayName,
		Bio:                 s.Bio,
		AvatarURL:           s.AvatarUrl,
		TwitterURL:          s.TwitterUrl,
		GitHubURL:           s.GithubUrl,
		BilibiliURL:         s.BilibiliUrl,
		CustomLinks:         s.CustomLinks,
		BackgroundImageURL:  s.BackgroundImageUrl,
		SakuraParticlesEnabled: s.SakuraParticlesEnabled,
		ThemeColor:          s.ThemeColor,
	}
}
