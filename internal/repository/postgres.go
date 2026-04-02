package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/frozenfish/fish-website/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/xid"
)

// PostgresRepository implements all repository interfaces
type PostgresRepository struct {
	pool *pgxpool.Pool
}

// NewPostgresRepository creates a new PostgresRepository
func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

// NewPostRepository returns a PostRepository implementation
func (r *PostgresRepository) NewPostRepository() domain.PostRepository {
	return (*postgresPostRepository)(r)
}

// NewBlogRepository returns a BlogRepository implementation
func (r *PostgresRepository) NewBlogRepository() domain.BlogRepository {
	return (*postgresBlogRepository)(r)
}

// NewAlbumRepository returns an AlbumRepository implementation
func (r *PostgresRepository) NewAlbumRepository() domain.AlbumRepository {
	return (*postgresAlbumRepository)(r)
}

// NewSettingsRepository returns a SettingsRepository implementation
func (r *PostgresRepository) NewSettingsRepository() domain.SettingsRepository {
	return (*postgresSettingsRepository)(r)
}

// postgresPostRepository implements PostRepository
type postgresPostRepository PostgresRepository

func (r *postgresPostRepository) Create(ctx context.Context, post *domain.Post) (*domain.Post, error) {
	if post.ID == "" {
		post.ID = xid.New().String()
	}
	imageURLsJSON, err := json.Marshal(post.ImageURLs)
	if err != nil {
		return nil, fmt.Errorf("marshal image urls: %w", err)
	}
	_, err = r.pool.Exec(ctx,
		"INSERT INTO posts (id, content, image_urls, created_at) VALUES ($1, $2, $3, $4)",
		post.ID, post.Content, imageURLsJSON, post.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert post: %w", err)
	}
	return post, nil
}

func (r *postgresPostRepository) List(ctx context.Context, pageSize int, pageToken string) ([]*domain.Post, string, bool, error) {
	query := `
		SELECT id, content, image_urls, created_at
		FROM posts
		WHERE ($1 = '' OR id < $1)
		ORDER BY created_at DESC
		LIMIT $2
	`
	rows, err := r.pool.Query(ctx, query, pageToken, pageSize+1)
	if err != nil {
		return nil, "", false, fmt.Errorf("query posts: %w", err)
	}
	defer rows.Close()

	var posts []*domain.Post
	for rows.Next() {
		var post domain.Post
		var imageURLsJSON []byte
		err := rows.Scan(&post.ID, &post.Content, &imageURLsJSON, &post.CreatedAt)
		if err != nil {
			return nil, "", false, fmt.Errorf("scan post: %w", err)
		}
		if err := json.Unmarshal(imageURLsJSON, &post.ImageURLs); err != nil {
			return nil, "", false, fmt.Errorf("unmarshal image urls: %w", err)
		}
		posts = append(posts, &post)
	}

	if err := rows.Err(); err != nil {
		return nil, "", false, fmt.Errorf("rows error: %w", err)
	}

	hasMore := len(posts) > pageSize
	nextPageToken := ""
	if hasMore {
		nextPageToken = posts[pageSize].ID
		posts = posts[:pageSize]
	}

	return posts, nextPageToken, hasMore, nil
}

// postgresBlogRepository implements BlogRepository
type postgresBlogRepository PostgresRepository

func (r *postgresBlogRepository) CreateArticle(ctx context.Context, article *domain.Article) (*domain.Article, error) {
	if article.ID == "" {
		article.ID = xid.New().String()
	}
	tagsJSON, err := json.Marshal(article.Tags)
	if err != nil {
		return nil, fmt.Errorf("marshal tags: %w", err)
	}
	_, err = r.pool.Exec(ctx,
		"INSERT INTO articles (id, title, content, folder_id, tags, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
		article.ID, article.Title, article.Content, nullString(article.FolderID), tagsJSON, article.CreatedAt, article.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert article: %w", err)
	}
	return article, nil
}

func (r *postgresBlogRepository) ListArticles(ctx context.Context, pageSize int, pageToken string, folderID string, tag string) ([]*domain.Article, string, bool, error) {
	query := `
		SELECT id, title, content, folder_id, tags, created_at, updated_at
		FROM articles
		WHERE ($1 = '' OR id < $1)
		AND ($2 = '' OR folder_id = $2)
		AND ($3 = '' OR tags @> to_jsonb($3::text))
		ORDER BY created_at DESC
		LIMIT $4
	`
	rows, err := r.pool.Query(ctx, query, pageToken, nullString(folderID), tag, pageSize+1)
	if err != nil {
		return nil, "", false, fmt.Errorf("query articles: %w", err)
	}
	defer rows.Close()

	var articles []*domain.Article
	for rows.Next() {
		var article domain.Article
		var tagsJSON []byte
		var folderID sql.NullString
		err := rows.Scan(&article.ID, &article.Title, &article.Content, &folderID, &tagsJSON, &article.CreatedAt, &article.UpdatedAt)
		if err != nil {
			return nil, "", false, fmt.Errorf("scan article: %w", err)
		}
		if folderID.Valid {
			article.FolderID = folderID.String
		}
		if err := json.Unmarshal(tagsJSON, &article.Tags); err != nil {
			return nil, "", false, fmt.Errorf("unmarshal tags: %w", err)
		}
		articles = append(articles, &article)
	}

	if err := rows.Err(); err != nil {
		return nil, "", false, fmt.Errorf("rows error: %w", err)
	}

	hasMore := len(articles) > pageSize
	nextPageToken := ""
	if hasMore {
		nextPageToken = articles[pageSize].ID
		articles = articles[:pageSize]
	}

	return articles, nextPageToken, hasMore, nil
}

func (r *postgresBlogRepository) GetArticle(ctx context.Context, articleID string) (*domain.Article, error) {
	var article domain.Article
	var tagsJSON []byte
	var folderID sql.NullString
	err := r.pool.QueryRow(ctx,
		"SELECT id, title, content, folder_id, tags, created_at, updated_at FROM articles WHERE id = $1",
		articleID,
	).Scan(&article.ID, &article.Title, &article.Content, &folderID, &tagsJSON, &article.CreatedAt, &article.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("query article: %w", err)
	}
	if folderID.Valid {
		article.FolderID = folderID.String
	}
	if err := json.Unmarshal(tagsJSON, &article.Tags); err != nil {
		return nil, fmt.Errorf("unmarshal tags: %w", err)
	}
	return &article, nil
}

func (r *postgresBlogRepository) GetFolders(ctx context.Context) ([]*domain.Folder, error) {
	rows, err := r.pool.Query(ctx, "SELECT id, name, parent_folder_id FROM folders ORDER BY name")
	if err != nil {
		return nil, fmt.Errorf("query folders: %w", err)
	}
	defer rows.Close()

	var folders []*domain.Folder
	folderMap := make(map[string]*domain.Folder)
	for rows.Next() {
		var folder domain.Folder
		var parentID sql.NullString
		err := rows.Scan(&folder.ID, &folder.Name, &parentID)
		if err != nil {
			return nil, fmt.Errorf("scan folder: %w", err)
		}
		if parentID.Valid {
			folder.ParentFolderID = parentID.String
		}
		folder.Children = []*domain.Folder{}
		folderMap[folder.ID] = &folder
		folders = append(folders, &folder)
	}

	// Build hierarchy
	var rootFolders []*domain.Folder
	for _, folder := range folders {
		if folder.ParentFolderID == "" {
			rootFolders = append(rootFolders, folder)
		} else if parent, ok := folderMap[folder.ParentFolderID]; ok {
			parent.Children = append(parent.Children, folder)
		}
	}

	return rootFolders, nil
}

// postgresAlbumRepository implements AlbumRepository
type postgresAlbumRepository PostgresRepository

func (r *postgresAlbumRepository) CreateAlbum(ctx context.Context, album *domain.Album) (*domain.Album, error) {
	if album.ID == "" {
		album.ID = xid.New().String()
	}
	_, err := r.pool.Exec(ctx,
		"INSERT INTO albums (id, name, description, is_public, created_at) VALUES ($1, $2, $3, $4, $5)",
		album.ID, album.Name, nullString(album.Description), album.IsPublic, album.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert album: %w", err)
	}
	return album, nil
}

func (r *postgresAlbumRepository) GetAlbum(ctx context.Context, albumID string) (*domain.Album, error) {
	var album domain.Album
	var description sql.NullString
	err := r.pool.QueryRow(ctx,
		"SELECT id, name, description, is_public, created_at FROM albums WHERE id = $1",
		albumID,
	).Scan(&album.ID, &album.Name, &description, &album.IsPublic, &album.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("query album: %w", err)
	}
	if description.Valid {
		album.Description = description.String
	}
	return &album, nil
}

func (r *postgresAlbumRepository) CreateImage(ctx context.Context, image *domain.Image) (*domain.Image, error) {
	if image.ID == "" {
		image.ID = xid.New().String()
	}
	_, err := r.pool.Exec(ctx,
		`INSERT INTO images (id, album_id, url, thumbnail_url, file_name, file_size, mime_type, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		image.ID, image.AlbumID, nullString(image.URL), nullString(image.ThumbnailURL),
		image.FileName, image.FileSize, image.MimeType, image.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert image: %w", err)
	}
	return image, nil
}

func (r *postgresAlbumRepository) GetImage(ctx context.Context, imageID string) (*domain.Image, error) {
	var image domain.Image
	var url, thumbnailURL sql.NullString
	err := r.pool.QueryRow(ctx,
		`SELECT id, album_id, url, thumbnail_url, file_name, file_size, mime_type, created_at
		 FROM images WHERE id = $1`,
		imageID,
	).Scan(&image.ID, &image.AlbumID, &url, &thumbnailURL, &image.FileName, &image.FileSize, &image.MimeType, &image.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("query image: %w", err)
	}
	if url.Valid {
		image.URL = url.String
	}
	if thumbnailURL.Valid {
		image.ThumbnailURL = thumbnailURL.String
	}
	return &image, nil
}

func (r *postgresAlbumRepository) UpdateImage(ctx context.Context, image *domain.Image) (*domain.Image, error) {
	_, err := r.pool.Exec(ctx,
		`UPDATE images SET url = $1, thumbnail_url = $2 WHERE id = $3`,
		nullString(image.URL), nullString(image.ThumbnailURL), image.ID,
	)
	if err != nil {
		return nil, fmt.Errorf("update image: %w", err)
	}
	return image, nil
}

// postgresSettingsRepository implements SettingsRepository
type postgresSettingsRepository PostgresRepository

func (r *postgresSettingsRepository) Get(ctx context.Context) (*domain.Settings, error) {
	var settings domain.Settings
	var displayName, bio, avatarURL, twitterURL, githubURL, bilibiliURL sql.NullString
	var customLinks, backgroundImageURL, themeColor sql.NullString
	err := r.pool.QueryRow(ctx,
		`SELECT display_name, bio, avatar_url, twitter_url, github_url, bilibili_url,
		        custom_links, background_image_url, sakura_particles_enabled, theme_color, updated_at
		 FROM settings WHERE id = 1`,
	).Scan(
		&displayName, &bio, &avatarURL, &twitterURL, &githubURL, &bilibiliURL,
		&customLinks, &backgroundImageURL, &settings.SakuraParticlesEnabled, &themeColor, &settings.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("query settings: %w", err)
	}
	if displayName.Valid {
		settings.DisplayName = displayName.String
	}
	if bio.Valid {
		settings.Bio = bio.String
	}
	if avatarURL.Valid {
		settings.AvatarURL = avatarURL.String
	}
	if twitterURL.Valid {
		settings.TwitterURL = twitterURL.String
	}
	if githubURL.Valid {
		settings.GitHubURL = githubURL.String
	}
	if bilibiliURL.Valid {
		settings.BilibiliURL = bilibiliURL.String
	}
	if customLinks.Valid {
		settings.CustomLinks = customLinks.String
	}
	if backgroundImageURL.Valid {
		settings.BackgroundImageURL = backgroundImageURL.String
	}
	if themeColor.Valid {
		settings.ThemeColor = themeColor.String
	}
	return &settings, nil
}

func (r *postgresSettingsRepository) Update(ctx context.Context, settings *domain.Settings) (*domain.Settings, error) {
	_, err := r.pool.Exec(ctx,
		`UPDATE settings SET
			display_name = $1, bio = $2, avatar_url = $3,
			twitter_url = $4, github_url = $5, bilibili_url = $6,
			custom_links = $7, background_image_url = $8,
			sakura_particles_enabled = $9, theme_color = $10, updated_at = $11
		 WHERE id = 1`,
		nullString(settings.DisplayName), nullString(settings.Bio), nullString(settings.AvatarURL),
		nullString(settings.TwitterURL), nullString(settings.GitHubURL), nullString(settings.BilibiliURL),
		nullString(settings.CustomLinks), nullString(settings.BackgroundImageURL),
		settings.SakuraParticlesEnabled, nullString(settings.ThemeColor), settings.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("update settings: %w", err)
	}
	return settings, nil
}

func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{Valid: false}
	}
	return sql.NullString{String: s, Valid: true}
}
