package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/frozenfish/fish-website/internal/domain"
	"github.com/google/uuid"
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

// NewImageReferenceRepository returns an ImageReferenceRepository implementation
func (r *PostgresRepository) NewImageReferenceRepository() domain.ImageReferenceRepository {
	return (*postgresImageReferenceRepository)(r)
}

// postgresPostRepository implements PostRepository
type postgresPostRepository PostgresRepository

func (r *postgresPostRepository) Create(ctx context.Context, post *domain.Post) (*domain.Post, error) {
	if post.ID == "" {
		id, err := uuid.NewV7()
		if err != nil {
			post.ID = xid.New().String()
		} else {
			post.ID = id.String()
		}
	}
	if post.UpdatedAt.IsZero() {
		post.UpdatedAt = post.CreatedAt
	}
	imageURLsJSON, err := json.Marshal(post.ImageURLs)
	if err != nil {
		return nil, fmt.Errorf("marshal image urls: %w", err)
	}
	_, err = r.pool.Exec(ctx,
		"INSERT INTO posts (id, content, image_urls, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
		post.ID, post.Content, imageURLsJSON, post.CreatedAt, post.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert post: %w", err)
	}
	return post, nil
}

func (r *postgresPostRepository) List(ctx context.Context, pageSize int, pageToken string) ([]*domain.Post, string, bool, error) {
	query := `
		SELECT id, content, image_urls, created_at, updated_at
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
		err := rows.Scan(&post.ID, &post.Content, &imageURLsJSON, &post.CreatedAt, &post.UpdatedAt)
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

func (r *postgresPostRepository) Get(ctx context.Context, id string) (*domain.Post, error) {
	var post domain.Post
	var imageURLsJSON []byte
	err := r.pool.QueryRow(ctx,
		"SELECT id, content, image_urls, created_at, updated_at FROM posts WHERE id = $1",
		id,
	).Scan(&post.ID, &post.Content, &imageURLsJSON, &post.CreatedAt, &post.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("query post: %w", err)
	}
	if err := json.Unmarshal(imageURLsJSON, &post.ImageURLs); err != nil {
		return nil, fmt.Errorf("unmarshal image urls: %w", err)
	}
	return &post, nil
}

func (r *postgresPostRepository) Update(ctx context.Context, post *domain.Post) (*domain.Post, error) {
	imageURLsJSON, err := json.Marshal(post.ImageURLs)
	if err != nil {
		return nil, fmt.Errorf("marshal image urls: %w", err)
	}
	_, err = r.pool.Exec(ctx,
		"UPDATE posts SET content = $1, image_urls = $2, updated_at = $3 WHERE id = $4",
		post.Content, imageURLsJSON, post.UpdatedAt, post.ID,
	)
	if err != nil {
		return nil, fmt.Errorf("update post: %w", err)
	}
	return post, nil
}

func (r *postgresPostRepository) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, "DELETE FROM posts WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("delete post: %w", err)
	}
	return nil
}

// postgresBlogRepository implements BlogRepository
type postgresBlogRepository PostgresRepository

const (
	rootFolderID   = "root"
	rootFolderName = "根目录"
)

func (r *postgresBlogRepository) ensureRootFolder(ctx context.Context) error {
	_, err := r.pool.Exec(ctx,
		"INSERT INTO folders (id, name, parent_folder_id) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING",
		rootFolderID,
		rootFolderName,
	)
	if err != nil {
		return fmt.Errorf("ensure root folder: %w", err)
	}
	return nil
}

func (r *postgresBlogRepository) CreateArticle(ctx context.Context, article *domain.Article) (*domain.Article, error) {
	if err := r.ensureRootFolder(ctx); err != nil {
		return nil, err
	}
	if article.FolderID == "" {
		article.FolderID = rootFolderID
	}
	if article.ID == "" {
		id, err := uuid.NewV7()
		if err != nil {
			article.ID = xid.New().String()
		} else {
			article.ID = id.String()
		}
	}
	if article.Status == "" {
		article.Status = "published"
	}
	tagsJSON, err := json.Marshal(article.Tags)
	if err != nil {
		return nil, fmt.Errorf("marshal tags: %w", err)
	}
	_, err = r.pool.Exec(ctx,
		"INSERT INTO articles (id, title, content, folder_id, tags, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
		article.ID, article.Title, article.Content, nullString(article.FolderID), tagsJSON, article.Status, article.CreatedAt, article.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert article: %w", err)
	}
	return article, nil
}

func (r *postgresBlogRepository) UpdateArticle(ctx context.Context, article *domain.Article) (*domain.Article, error) {
	tagsJSON, err := json.Marshal(article.Tags)
	if err != nil {
		return nil, fmt.Errorf("marshal tags: %w", err)
	}

	_, err = r.pool.Exec(ctx,
		`UPDATE articles
		 SET title = $1, content = $2, folder_id = $3, tags = $4, status = $5, updated_at = $6
		 WHERE id = $7`,
		article.Title, article.Content, nullString(article.FolderID), tagsJSON, article.Status, article.UpdatedAt, article.ID,
	)
	if err != nil {
		return nil, fmt.Errorf("update article: %w", err)
	}

	return article, nil
}

func (r *postgresBlogRepository) DeleteArticle(ctx context.Context, articleID string) error {
	_, err := r.pool.Exec(ctx, "DELETE FROM articles WHERE id = $1", articleID)
	if err != nil {
		return fmt.Errorf("delete article: %w", err)
	}
	return nil
}

func (r *postgresBlogRepository) ListArticles(ctx context.Context, pageSize int, pageToken string, folderID string, tag string, status string) ([]*domain.Article, string, bool, error) {
	if err := r.ensureRootFolder(ctx); err != nil {
		return nil, "", false, err
	}
	query := `
		WITH RECURSIVE selected_folders AS (
			SELECT id FROM folders WHERE id = $2
			UNION ALL
			SELECT f.id FROM folders f
			INNER JOIN selected_folders sf ON f.parent_folder_id = sf.id
		)
		SELECT id, title, content, folder_id, tags, status, created_at, updated_at
		FROM articles
		WHERE ($1 = '' OR id < $1)
		AND (
			$2 = ''
			OR ($2 = 'root' AND (folder_id IS NULL OR folder_id IN (SELECT id FROM selected_folders)))
			OR ($2 <> 'root' AND folder_id IN (SELECT id FROM selected_folders))
		)
		AND ($3 = '' OR tags @> to_jsonb($3::text))
		AND ($4 = '' OR status = $4)
		ORDER BY created_at DESC
		LIMIT $5
	`
	rows, err := r.pool.Query(ctx, query, pageToken, folderID, tag, status, pageSize+1)
	if err != nil {
		return nil, "", false, fmt.Errorf("query articles: %w", err)
	}
	defer rows.Close()

	var articles []*domain.Article
	for rows.Next() {
		var article domain.Article
		var tagsJSON []byte
		var folderID sql.NullString
		err := rows.Scan(&article.ID, &article.Title, &article.Content, &folderID, &tagsJSON, &article.Status, &article.CreatedAt, &article.UpdatedAt)
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
		"SELECT id, title, content, folder_id, tags, status, created_at, updated_at FROM articles WHERE id = $1",
		articleID,
	).Scan(&article.ID, &article.Title, &article.Content, &folderID, &tagsJSON, &article.Status, &article.CreatedAt, &article.UpdatedAt)
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

func (r *postgresBlogRepository) CreateFolder(ctx context.Context, folder *domain.Folder) (*domain.Folder, error) {
	if err := r.ensureRootFolder(ctx); err != nil {
		return nil, err
	}
	if folder.ID == "" {
		folder.ID = xid.New().String()
	}
	if folder.ParentFolderID == "" && folder.ID != rootFolderID {
		folder.ParentFolderID = rootFolderID
	}

	_, err := r.pool.Exec(ctx,
		"INSERT INTO folders (id, name, parent_folder_id) VALUES ($1, $2, $3)",
		folder.ID, folder.Name, nullString(folder.ParentFolderID),
	)
	if err != nil {
		return nil, fmt.Errorf("insert folder: %w", err)
	}

	return folder, nil
}

func (r *postgresBlogRepository) UpdateFolder(ctx context.Context, folder *domain.Folder) (*domain.Folder, error) {
	if folder.ID == rootFolderID {
		return folder, nil
	}
	_, err := r.pool.Exec(ctx,
		"UPDATE folders SET name = $1, parent_folder_id = $2 WHERE id = $3",
		folder.Name, nullString(folder.ParentFolderID), folder.ID,
	)
	if err != nil {
		return nil, fmt.Errorf("update folder: %w", err)
	}
	return folder, nil
}

func (r *postgresBlogRepository) DeleteFolder(ctx context.Context, folderID string) error {
	if folderID == "" || folderID == rootFolderID {
		return nil
	}
	if err := r.ensureRootFolder(ctx); err != nil {
		return err
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		WITH RECURSIVE folder_tree AS (
			SELECT id FROM folders WHERE id = $1
			UNION ALL
			SELECT f.id FROM folders f
			INNER JOIN folder_tree ft ON f.parent_folder_id = ft.id
		)
		SELECT id FROM folder_tree
	`, folderID)
	if err != nil {
		return fmt.Errorf("query folder tree: %w", err)
	}
	defer rows.Close()

	folderIDs := make([]string, 0, 8)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return fmt.Errorf("scan folder id: %w", err)
		}
		if id != rootFolderID {
			folderIDs = append(folderIDs, id)
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("folder tree rows: %w", err)
	}
	if len(folderIDs) == 0 {
		return nil
	}

	_, err = tx.Exec(ctx, `
		UPDATE articles
		SET folder_id = $1, updated_at = NOW()
		WHERE folder_id = ANY($2)
	`, rootFolderID, folderIDs)
	if err != nil {
		return fmt.Errorf("move articles to root: %w", err)
	}

	_, err = tx.Exec(ctx, `DELETE FROM folders WHERE id = ANY($1)`, folderIDs)
	if err != nil {
		return fmt.Errorf("delete folders: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}

	return nil
}

func (r *postgresBlogRepository) GetFolders(ctx context.Context) ([]*domain.Folder, error) {
	if err := r.ensureRootFolder(ctx); err != nil {
		return nil, err
	}

	rows, err := r.pool.Query(ctx, "SELECT id, name, parent_folder_id FROM folders ORDER BY CASE WHEN id = 'root' THEN 0 ELSE 1 END, name")
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

func (r *postgresAlbumRepository) UpdateAlbum(ctx context.Context, album *domain.Album) (*domain.Album, error) {
	_, err := r.pool.Exec(ctx,
		"UPDATE albums SET name = $1, description = $2, is_public = $3 WHERE id = $4",
		album.Name, nullString(album.Description), album.IsPublic, album.ID,
	)
	if err != nil {
		return nil, fmt.Errorf("update album: %w", err)
	}
	return album, nil
}

func (r *postgresAlbumRepository) ListAlbums(ctx context.Context, pageSize int, pageToken string, onlyPublic bool) ([]*domain.Album, string, bool, error) {
	if pageSize <= 0 {
		pageSize = 20
	}

	query := `
		SELECT id, name, description, is_public, created_at
		FROM albums
		WHERE ($1 = '' OR id < $1)
		AND (NOT $2 OR is_public = true)
		ORDER BY created_at DESC
		LIMIT $3
	`

	rows, err := r.pool.Query(ctx, query, pageToken, onlyPublic, pageSize+1)
	if err != nil {
		return nil, "", false, fmt.Errorf("query albums: %w", err)
	}
	defer rows.Close()

	albums := make([]*domain.Album, 0, pageSize+1)
	for rows.Next() {
		var album domain.Album
		var description sql.NullString
		if err := rows.Scan(&album.ID, &album.Name, &description, &album.IsPublic, &album.CreatedAt); err != nil {
			return nil, "", false, fmt.Errorf("scan album: %w", err)
		}
		if description.Valid {
			album.Description = description.String
		}
		albums = append(albums, &album)
	}

	if err := rows.Err(); err != nil {
		return nil, "", false, fmt.Errorf("rows error: %w", err)
	}

	hasMore := len(albums) > pageSize
	nextPageToken := ""
	if hasMore {
		nextPageToken = albums[pageSize].ID
		albums = albums[:pageSize]
	}

	return albums, nextPageToken, hasMore, nil
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

func (r *postgresAlbumRepository) ListImagesByAlbum(ctx context.Context, albumID string, pageSize int, pageToken string) ([]*domain.Image, string, bool, error) {
	if pageSize <= 0 {
		pageSize = 50
	}

	query := `
		SELECT id, album_id, url, thumbnail_url, file_name, file_size, mime_type, created_at
		FROM images
		WHERE album_id = $1
		AND ($2 = '' OR id < $2)
		ORDER BY created_at DESC
		LIMIT $3
	`

	rows, err := r.pool.Query(ctx, query, albumID, pageToken, pageSize+1)
	if err != nil {
		return nil, "", false, fmt.Errorf("query images by album: %w", err)
	}
	defer rows.Close()

	images := make([]*domain.Image, 0, pageSize+1)
	for rows.Next() {
		var image domain.Image
		var url, thumbnailURL sql.NullString
		if err := rows.Scan(&image.ID, &image.AlbumID, &url, &thumbnailURL, &image.FileName, &image.FileSize, &image.MimeType, &image.CreatedAt); err != nil {
			return nil, "", false, fmt.Errorf("scan image: %w", err)
		}
		if url.Valid {
			image.URL = url.String
		}
		if thumbnailURL.Valid {
			image.ThumbnailURL = thumbnailURL.String
		}
		images = append(images, &image)
	}

	if err := rows.Err(); err != nil {
		return nil, "", false, fmt.Errorf("rows error: %w", err)
	}

	hasMore := len(images) > pageSize
	nextPageToken := ""
	if hasMore {
		nextPageToken = images[pageSize].ID
		images = images[:pageSize]
	}

	return images, nextPageToken, hasMore, nil
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

func (r *postgresAlbumRepository) MoveImagesToAlbum(ctx context.Context, fromAlbumID string, imageIDs []string, targetAlbumID string) ([]*domain.Image, error) {
	if len(imageIDs) == 0 {
		return []*domain.Image{}, nil
	}

	rows, err := r.pool.Query(ctx,
		`UPDATE images
		 SET album_id = $3
		 WHERE album_id = $1 AND id = ANY($2)
		 RETURNING id, album_id, url, thumbnail_url, file_name, file_size, mime_type, created_at`,
		fromAlbumID,
		imageIDs,
		targetAlbumID,
	)
	if err != nil {
		return nil, fmt.Errorf("move images to album: %w", err)
	}
	defer rows.Close()

	moved := make([]*domain.Image, 0, len(imageIDs))
	for rows.Next() {
		var image domain.Image
		var url, thumbnailURL sql.NullString
		if err := rows.Scan(&image.ID, &image.AlbumID, &url, &thumbnailURL, &image.FileName, &image.FileSize, &image.MimeType, &image.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan moved image: %w", err)
		}
		if url.Valid {
			image.URL = url.String
		}
		if thumbnailURL.Valid {
			image.ThumbnailURL = thumbnailURL.String
		}
		moved = append(moved, &image)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %w", err)
	}

	return moved, nil
}

func (r *postgresAlbumRepository) DeleteImages(ctx context.Context, albumID string, imageIDs []string) ([]*domain.Image, error) {
	if len(imageIDs) == 0 {
		return []*domain.Image{}, nil
	}

	rows, err := r.pool.Query(ctx,
		`DELETE FROM images
		 WHERE album_id = $1 AND id = ANY($2)
		 RETURNING id, album_id, url, thumbnail_url, file_name, file_size, mime_type, created_at`,
		albumID,
		imageIDs,
	)
	if err != nil {
		return nil, fmt.Errorf("delete images: %w", err)
	}
	defer rows.Close()

	deleted := make([]*domain.Image, 0, len(imageIDs))
	for rows.Next() {
		var image domain.Image
		var url, thumbnailURL sql.NullString
		if err := rows.Scan(&image.ID, &image.AlbumID, &url, &thumbnailURL, &image.FileName, &image.FileSize, &image.MimeType, &image.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan deleted image: %w", err)
		}
		if url.Valid {
			image.URL = url.String
		}
		if thumbnailURL.Valid {
			image.ThumbnailURL = thumbnailURL.String
		}
		deleted = append(deleted, &image)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %w", err)
	}

	return deleted, nil
}

func (r *postgresAlbumRepository) DeleteAlbum(ctx context.Context, albumID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM albums WHERE id = $1`, albumID)
	if err != nil {
		return fmt.Errorf("delete album: %w", err)
	}
	return nil
}

// postgresSettingsRepository implements SettingsRepository
type postgresSettingsRepository PostgresRepository

// postgresImageReferenceRepository implements ImageReferenceRepository
type postgresImageReferenceRepository PostgresRepository

func (r *postgresImageReferenceRepository) AdjustByURLs(ctx context.Context, urls []string, source string, delta int) error {
	if delta == 0 || len(urls) == 0 {
		return nil
	}

	unique := uniqueNonEmptyURLs(urls)
	if len(unique) == 0 {
		return nil
	}

	var query string
	switch source {
	case "post":
		query = `
			INSERT INTO image_references (image_id, ref_count, post_ref_count, blog_ref_count, avatar_ref_count, background_ref_count, updated_at)
			SELECT i.id, $2, $2, 0, 0, 0, NOW()
			FROM images i
			WHERE i.url = ANY($1)
			ON CONFLICT (image_id) DO UPDATE SET
				ref_count = GREATEST(0, image_references.ref_count + EXCLUDED.ref_count),
				post_ref_count = GREATEST(0, image_references.post_ref_count + EXCLUDED.post_ref_count),
				updated_at = NOW()
		`
	case "blog":
		query = `
			INSERT INTO image_references (image_id, ref_count, post_ref_count, blog_ref_count, avatar_ref_count, background_ref_count, updated_at)
			SELECT i.id, $2, 0, $2, 0, 0, NOW()
			FROM images i
			WHERE i.url = ANY($1)
			ON CONFLICT (image_id) DO UPDATE SET
				ref_count = GREATEST(0, image_references.ref_count + EXCLUDED.ref_count),
				blog_ref_count = GREATEST(0, image_references.blog_ref_count + EXCLUDED.blog_ref_count),
				updated_at = NOW()
		`
	case "avatar":
		query = `
			INSERT INTO image_references (image_id, ref_count, post_ref_count, blog_ref_count, avatar_ref_count, background_ref_count, updated_at)
			SELECT i.id, $2, 0, 0, $2, 0, NOW()
			FROM images i
			WHERE i.url = ANY($1)
			ON CONFLICT (image_id) DO UPDATE SET
				ref_count = GREATEST(0, image_references.ref_count + EXCLUDED.ref_count),
				avatar_ref_count = GREATEST(0, image_references.avatar_ref_count + EXCLUDED.avatar_ref_count),
				updated_at = NOW()
		`
	case "background":
		query = `
			INSERT INTO image_references (image_id, ref_count, post_ref_count, blog_ref_count, avatar_ref_count, background_ref_count, updated_at)
			SELECT i.id, $2, 0, 0, 0, $2, NOW()
			FROM images i
			WHERE i.url = ANY($1)
			ON CONFLICT (image_id) DO UPDATE SET
				ref_count = GREATEST(0, image_references.ref_count + EXCLUDED.ref_count),
				background_ref_count = GREATEST(0, image_references.background_ref_count + EXCLUDED.background_ref_count),
				updated_at = NOW()
		`
	default:
		return fmt.Errorf("unsupported reference source: %s", source)
	}

	_, err := r.pool.Exec(ctx, query, unique, delta)
	if err != nil {
		return fmt.Errorf("adjust references by urls: %w", err)
	}

	_, err = r.pool.Exec(ctx, `DELETE FROM image_references WHERE ref_count = 0 AND post_ref_count = 0 AND blog_ref_count = 0 AND avatar_ref_count = 0 AND background_ref_count = 0`)
	if err != nil {
		return fmt.Errorf("cleanup zero references: %w", err)
	}

	return nil
}

func (r *postgresImageReferenceRepository) AnalyzeByAlbum(ctx context.Context, albumID string) ([]*domain.ImageReferenceRecord, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT i.id, COALESCE(i.url, ''), i.file_name,
			COALESCE(ref.ref_count, 0), COALESCE(ref.post_ref_count, 0), COALESCE(ref.blog_ref_count, 0),
			COALESCE(ref.avatar_ref_count, 0), COALESCE(ref.background_ref_count, 0)
		FROM images i
		LEFT JOIN image_references ref ON ref.image_id = i.id
		WHERE i.album_id = $1
		ORDER BY i.created_at DESC
	`, albumID)
	if err != nil {
		return nil, fmt.Errorf("analyze references by album: %w", err)
	}
	defer rows.Close()

	records := make([]*domain.ImageReferenceRecord, 0)
	for rows.Next() {
		var rec domain.ImageReferenceRecord
		if err := rows.Scan(&rec.ImageID, &rec.URL, &rec.FileName, &rec.ReferenceCount, &rec.PostReferenceCount, &rec.BlogReferenceCount, &rec.AvatarRefCount, &rec.BackgroundRefCount); err != nil {
			return nil, fmt.Errorf("scan reference record: %w", err)
		}
		records = append(records, &rec)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("reference rows error: %w", err)
	}

	return records, nil
}

func (r *postgresImageReferenceRepository) RepairConsistency(ctx context.Context) (*domain.ImageReferenceRepairResult, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin repair tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `TRUNCATE TABLE image_references`); err != nil {
		return nil, fmt.Errorf("truncate image_references: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO image_references (image_id, ref_count, post_ref_count, blog_ref_count, avatar_ref_count, background_ref_count, updated_at)
		SELECT i.id, COUNT(*)::int, COUNT(*)::int, 0, 0, 0, NOW()
		FROM posts p
		CROSS JOIN LATERAL jsonb_array_elements_text(p.image_urls) AS u(url)
		INNER JOIN images i ON i.url = u.url
		GROUP BY i.id
	`); err != nil {
		return nil, fmt.Errorf("rebuild post references: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO image_references (image_id, ref_count, post_ref_count, blog_ref_count, avatar_ref_count, background_ref_count, updated_at)
		SELECT i.id, COUNT(*)::int, 0, COUNT(*)::int, 0, 0, NOW()
		FROM articles a
		CROSS JOIN LATERAL regexp_matches(a.content, '!\\[[^\\]]*\\]\\(([^)]+)\\)', 'g') AS m
		INNER JOIN images i ON i.url = m[1]
		GROUP BY i.id
		ON CONFLICT (image_id) DO UPDATE SET
			ref_count = image_references.ref_count + EXCLUDED.ref_count,
			blog_ref_count = image_references.blog_ref_count + EXCLUDED.blog_ref_count,
			updated_at = NOW()
	`); err != nil {
		return nil, fmt.Errorf("rebuild blog references: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO image_references (image_id, ref_count, post_ref_count, blog_ref_count, avatar_ref_count, background_ref_count, updated_at)
		SELECT i.id, 1, 0, 0, 1, 0, NOW()
		FROM settings s
		INNER JOIN images i ON i.url = s.avatar_url
		WHERE s.id = 1 AND COALESCE(s.avatar_url, '') <> ''
		ON CONFLICT (image_id) DO UPDATE SET
			ref_count = image_references.ref_count + 1,
			avatar_ref_count = image_references.avatar_ref_count + 1,
			updated_at = NOW()
	`); err != nil {
		return nil, fmt.Errorf("rebuild avatar references: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO image_references (image_id, ref_count, post_ref_count, blog_ref_count, avatar_ref_count, background_ref_count, updated_at)
		SELECT i.id, 1, 0, 0, 0, 1, NOW()
		FROM settings s
		INNER JOIN images i ON i.url = s.background_image_url
		WHERE s.id = 1 AND COALESCE(s.background_image_url, '') <> ''
		ON CONFLICT (image_id) DO UPDATE SET
			ref_count = image_references.ref_count + 1,
			background_ref_count = image_references.background_ref_count + 1,
			updated_at = NOW()
	`); err != nil {
		return nil, fmt.Errorf("rebuild background references: %w", err)
	}

	var result domain.ImageReferenceRepairResult
	result.RepairedAt = time.Now()
	if err := tx.QueryRow(ctx, `SELECT COUNT(*), COALESCE(SUM(ref_count), 0) FROM image_references`).Scan(&result.ReferencedImages, &result.TotalRefCount); err != nil {
		return nil, fmt.Errorf("count rebuilt references: %w", err)
	}
	if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM images`).Scan(&result.ProcessedImages); err != nil {
		return nil, fmt.Errorf("count images: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit repair tx: %w", err)
	}

	return &result, nil
}

func uniqueNonEmptyURLs(urls []string) []string {
	set := make(map[string]struct{}, len(urls))
	result := make([]string, 0, len(urls))
	for _, u := range urls {
		if u == "" {
			continue
		}
		if _, exists := set[u]; exists {
			continue
		}
		set[u] = struct{}{}
		result = append(result, u)
	}
	return result
}

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
