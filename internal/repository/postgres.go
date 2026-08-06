package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/frozenfish/fish-website/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
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

func (r *PostgresRepository) NewProjectRepository() domain.ProjectRepository {
	return (*postgresProjectRepository)(r)
}

func (r *PostgresRepository) NewAboutRepository() domain.AboutRepository {
	return (*postgresAboutRepository)(r)
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
		AND (NOT $2 OR (is_public = true AND id NOT IN ('default', 'recycle-bin')))
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
		`INSERT INTO images (id, album_id, object_key, thumbnail_object_key, url, thumbnail_url, file_name, file_size, mime_type, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		image.ID, image.AlbumID, nullString(image.ObjectKey), nullString(image.ThumbnailObjectKey),
		nullString(image.URL), nullString(image.ThumbnailURL), image.FileName, image.FileSize, image.MimeType, image.CreatedAt,
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
		SELECT id, album_id, object_key, thumbnail_object_key, url, thumbnail_url, file_name, file_size, mime_type, created_at
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
		image, err := scanImage(rows)
		if err != nil {
			return nil, "", false, fmt.Errorf("scan image: %w", err)
		}
		images = append(images, image)
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
	image, err := scanImage(r.pool.QueryRow(ctx,
		`SELECT id, album_id, object_key, thumbnail_object_key, url, thumbnail_url, file_name, file_size, mime_type, created_at
		 FROM images WHERE id = $1`, imageID))
	if err != nil {
		return nil, fmt.Errorf("query image: %w", err)
	}
	return image, nil
}

func (r *postgresAlbumRepository) UpdateImage(ctx context.Context, image *domain.Image) (*domain.Image, error) {
	_, err := r.pool.Exec(ctx,
		`UPDATE images
		 SET object_key = $1, thumbnail_object_key = $2, url = $3, thumbnail_url = $4
		 WHERE id = $5`,
		nullString(image.ObjectKey), nullString(image.ThumbnailObjectKey), nullString(image.URL), nullString(image.ThumbnailURL), image.ID,
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
		 RETURNING id, album_id, object_key, thumbnail_object_key, url, thumbnail_url, file_name, file_size, mime_type, created_at`,
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
		image, err := scanImage(rows)
		if err != nil {
			return nil, fmt.Errorf("scan moved image: %w", err)
		}
		moved = append(moved, image)
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
		 RETURNING id, album_id, object_key, thumbnail_object_key, url, thumbnail_url, file_name, file_size, mime_type, created_at`,
		albumID,
		imageIDs,
	)
	if err != nil {
		return nil, fmt.Errorf("delete images: %w", err)
	}
	defer rows.Close()

	deleted := make([]*domain.Image, 0, len(imageIDs))
	for rows.Next() {
		image, err := scanImage(rows)
		if err != nil {
			return nil, fmt.Errorf("scan deleted image: %w", err)
		}
		deleted = append(deleted, image)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %w", err)
	}

	return deleted, nil
}

type imageScanner interface {
	Scan(...any) error
}

func scanImage(row imageScanner) (*domain.Image, error) {
	var image domain.Image
	var objectKey, thumbnailObjectKey, url, thumbnailURL sql.NullString
	if err := row.Scan(
		&image.ID, &image.AlbumID, &objectKey, &thumbnailObjectKey, &url, &thumbnailURL,
		&image.FileName, &image.FileSize, &image.MimeType, &image.CreatedAt,
	); err != nil {
		return nil, err
	}
	if objectKey.Valid {
		image.ObjectKey = objectKey.String
	}
	if thumbnailObjectKey.Valid {
		image.ThumbnailObjectKey = thumbnailObjectKey.String
	}
	if url.Valid {
		image.URL = url.String
	}
	if thumbnailURL.Valid {
		image.ThumbnailURL = thumbnailURL.String
	}
	return &image, nil
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
	case "favicon":
		query = `
			INSERT INTO image_references (image_id, ref_count, post_ref_count, blog_ref_count, avatar_ref_count, background_ref_count, favicon_ref_count, updated_at)
			SELECT i.id, $2, 0, 0, 0, 0, $2, NOW()
			FROM images i
			WHERE i.url = ANY($1)
			ON CONFLICT (image_id) DO UPDATE SET
				ref_count = GREATEST(0, image_references.ref_count + EXCLUDED.ref_count),
				favicon_ref_count = GREATEST(0, image_references.favicon_ref_count + EXCLUDED.favicon_ref_count),
				updated_at = NOW()
		`
	default:
		return fmt.Errorf("unsupported reference source: %s", source)
	}

	_, err := r.pool.Exec(ctx, query, unique, delta)
	if err != nil {
		return fmt.Errorf("adjust references by urls: %w", err)
	}

	_, err = r.pool.Exec(ctx, `DELETE FROM image_references WHERE ref_count = 0 AND post_ref_count = 0 AND blog_ref_count = 0 AND avatar_ref_count = 0 AND background_ref_count = 0 AND COALESCE(favicon_ref_count, 0) = 0`)
	if err != nil {
		return fmt.Errorf("cleanup zero references: %w", err)
	}

	return nil
}

// ReplaceSourceReferences stores image IDs as the canonical reference facts
// while resolving legacy URL-based content at the boundary. The projection is
// rebuilt only for images touched by this source, keeping writes proportional
// to the changed content.
func (r *postgresImageReferenceRepository) ReplaceSourceReferences(ctx context.Context, sourceType, sourceID string, urls []string) error {
	if sourceType == "" || sourceID == "" {
		return fmt.Errorf("reference source type and id are required")
	}
	if !supportedReferenceSource(sourceType) {
		return fmt.Errorf("unsupported reference source: %s", sourceType)
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin replace references tx: %w", err)
	}
	defer tx.Rollback(ctx)

	oldIDs, err := querySourceImageIDs(ctx, tx, sourceType, sourceID)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`DELETE FROM image_reference_sources WHERE source_type = $1 AND source_id = $2`,
		sourceType, sourceID,
	); err != nil {
		return fmt.Errorf("delete source references: %w", err)
	}

	expanded := expandURLCounts(countNonEmptyURLs(urls))
	if len(expanded) > 0 {
		if _, err := tx.Exec(ctx, `
			INSERT INTO image_reference_sources
				(source_type, source_id, image_id, occurrence_count, updated_at)
			SELECT $1, $2, i.id, COUNT(*)::int, NOW()
			FROM unnest($3::text[]) AS u(url)
			INNER JOIN images i ON i.url = u.url
			GROUP BY i.id
			ON CONFLICT (source_type, source_id, image_id) DO UPDATE SET
				occurrence_count = EXCLUDED.occurrence_count,
				updated_at = NOW()
		`, sourceType, sourceID, expanded); err != nil {
			return fmt.Errorf("insert source references: %w", err)
		}
	}

	newIDs, err := querySourceImageIDs(ctx, tx, sourceType, sourceID)
	if err != nil {
		return err
	}
	affected := appendUniqueIDs(oldIDs, newIDs...)
	if err := rebuildReferenceProjection(ctx, tx, affected); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit replace references: %w", err)
	}
	return nil
}

// ReplaceSourceImageIDs is the ID-native path used by first-class content
// modules. It avoids URL resolution and keeps image identity stable when a
// delivery URL changes.
func (r *postgresImageReferenceRepository) ReplaceSourceImageIDs(ctx context.Context, sourceType, sourceID string, imageIDs []string) error {
	if sourceType == "" || sourceID == "" {
		return fmt.Errorf("reference source type and id are required")
	}
	if !supportedReferenceSource(sourceType) {
		return fmt.Errorf("unsupported reference source: %s", sourceType)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin replace image ID references tx: %w", err)
	}
	defer tx.Rollback(ctx)
	oldIDs, err := querySourceImageIDs(ctx, tx, sourceType, sourceID)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM image_reference_sources WHERE source_type = $1 AND source_id = $2`, sourceType, sourceID); err != nil {
		return fmt.Errorf("delete source image references: %w", err)
	}
	ids := appendUniqueIDs(nil, imageIDs...)
	if len(ids) > 0 {
		if _, err := tx.Exec(ctx, `
			INSERT INTO image_reference_sources (source_type, source_id, image_id, occurrence_count, updated_at)
			SELECT $1, $2, i.id, 1, NOW()
			FROM unnest($3::text[]) AS u(image_id)
			INNER JOIN images i ON i.id = u.image_id
			ON CONFLICT (source_type, source_id, image_id) DO UPDATE SET updated_at = NOW()
		`, sourceType, sourceID, ids); err != nil {
			return fmt.Errorf("insert source image references: %w", err)
		}
	}
	newIDs, err := querySourceImageIDs(ctx, tx, sourceType, sourceID)
	if err != nil {
		return err
	}
	if err := rebuildReferenceProjection(ctx, tx, appendUniqueIDs(oldIDs, newIDs...)); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit replace image ID references: %w", err)
	}
	return nil
}

func (r *postgresImageReferenceRepository) RemoveSourceReferences(ctx context.Context, sourceType, sourceID string) error {
	return r.ReplaceSourceReferences(ctx, sourceType, sourceID, nil)
}

func supportedReferenceSource(source string) bool {
	switch source {
	case "post", "blog", "avatar", "background", "favicon", "project", "about":
		return true
	default:
		return false
	}
}

func countNonEmptyURLs(urls []string) map[string]int {
	counts := make(map[string]int, len(urls))
	for _, url := range urls {
		if url != "" {
			counts[url]++
		}
	}
	return counts
}

func expandURLCounts(counts map[string]int) []string {
	urls := make([]string, 0)
	for url, count := range counts {
		for i := 0; i < count; i++ {
			urls = append(urls, url)
		}
	}
	return urls
}

func appendUniqueIDs(target []string, ids ...string) []string {
	seen := make(map[string]struct{}, len(target)+len(ids))
	for _, id := range target {
		seen[id] = struct{}{}
	}
	for _, id := range ids {
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		target = append(target, id)
	}
	return target
}

func querySourceImageIDs(ctx context.Context, tx interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, sourceType, sourceID string) ([]string, error) {
	rows, err := tx.Query(ctx,
		`SELECT image_id FROM image_reference_sources WHERE source_type = $1 AND source_id = $2`,
		sourceType, sourceID,
	)
	if err != nil {
		return nil, fmt.Errorf("query source image IDs: %w", err)
	}
	defer rows.Close()
	ids := make([]string, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan source image ID: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate source image IDs: %w", err)
	}
	return ids, nil
}

func rebuildReferenceProjection(ctx context.Context, tx interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}, imageIDs []string) error {
	if len(imageIDs) == 0 {
		return nil
	}
	if _, err := tx.Exec(ctx, `DELETE FROM image_references WHERE image_id = ANY($1::text[])`, imageIDs); err != nil {
		return fmt.Errorf("delete affected reference projections: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO image_references
			(image_id, ref_count, post_ref_count, blog_ref_count, avatar_ref_count, background_ref_count, favicon_ref_count, updated_at)
		SELECT image_id,
			SUM(occurrence_count)::int,
			COALESCE(SUM(occurrence_count) FILTER (WHERE source_type = 'post'), 0)::int,
			COALESCE(SUM(occurrence_count) FILTER (WHERE source_type = 'blog'), 0)::int,
			COALESCE(SUM(occurrence_count) FILTER (WHERE source_type = 'avatar'), 0)::int,
			COALESCE(SUM(occurrence_count) FILTER (WHERE source_type = 'background'), 0)::int,
			COALESCE(SUM(occurrence_count) FILTER (WHERE source_type = 'favicon'), 0)::int,
			NOW()
		FROM image_reference_sources
		WHERE image_id = ANY($1::text[])
		GROUP BY image_id
	`, imageIDs); err != nil {
		return fmt.Errorf("rebuild affected reference projections: %w", err)
	}
	return nil
}

func (r *postgresImageReferenceRepository) AnalyzeByAlbum(ctx context.Context, albumID string) ([]*domain.ImageReferenceRecord, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT i.id, COALESCE(i.url, ''), i.file_name,
			COALESCE(ref.ref_count, 0), COALESCE(ref.post_ref_count, 0), COALESCE(ref.blog_ref_count, 0),
			COALESCE(ref.avatar_ref_count, 0), COALESCE(ref.background_ref_count, 0), COALESCE(ref.favicon_ref_count, 0)
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
		if err := rows.Scan(&rec.ImageID, &rec.URL, &rec.FileName, &rec.ReferenceCount, &rec.PostReferenceCount, &rec.BlogReferenceCount, &rec.AvatarRefCount, &rec.BackgroundRefCount, &rec.FaviconRefCount); err != nil {
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
	return r.repairProjectionFromSources(ctx)
	/* Legacy URL rebuild retained below until the migration is deployed everywhere. */
	/*
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
			-- This is a Go raw string; keep one regex escape per metacharacter so
			-- PostgreSQL sees the same Markdown pattern as the usecase parser.
			CROSS JOIN LATERAL regexp_matches(a.content, '!\[[^\]]*\]\(([^)]+)\)', 'g') AS m
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

		if _, err := tx.Exec(ctx, `
			INSERT INTO image_references (image_id, ref_count, post_ref_count, blog_ref_count, avatar_ref_count, background_ref_count, favicon_ref_count, updated_at)
			SELECT i.id, 1, 0, 0, 0, 0, 1, NOW()
			FROM settings s
			INNER JOIN images i ON i.url = (s.custom_links::jsonb ->> 'siteFaviconUrl')
			WHERE s.id = 1 AND COALESCE(s.custom_links, '') <> '' AND COALESCE((s.custom_links::jsonb ->> 'siteFaviconUrl'), '') <> ''
			ON CONFLICT (image_id) DO UPDATE SET
				ref_count = image_references.ref_count + 1,
				favicon_ref_count = COALESCE(image_references.favicon_ref_count, 0) + 1,
				updated_at = NOW()
		`); err != nil {
			return nil, fmt.Errorf("rebuild favicon references: %w", err)
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
	*/
}

func (r *postgresImageReferenceRepository) repairProjectionFromSources(ctx context.Context) (*domain.ImageReferenceRepairResult, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin projection repair tx: %w", err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `TRUNCATE TABLE image_references`); err != nil {
		return nil, fmt.Errorf("truncate image_references: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO image_references
			(image_id, ref_count, post_ref_count, blog_ref_count, avatar_ref_count, background_ref_count, favicon_ref_count, updated_at)
		SELECT image_id,
			SUM(occurrence_count)::int,
			COALESCE(SUM(occurrence_count) FILTER (WHERE source_type = 'post'), 0)::int,
			COALESCE(SUM(occurrence_count) FILTER (WHERE source_type = 'blog'), 0)::int,
			COALESCE(SUM(occurrence_count) FILTER (WHERE source_type = 'avatar'), 0)::int,
			COALESCE(SUM(occurrence_count) FILTER (WHERE source_type = 'background'), 0)::int,
			COALESCE(SUM(occurrence_count) FILTER (WHERE source_type = 'favicon'), 0)::int,
			NOW()
		FROM image_reference_sources
		GROUP BY image_id
	`); err != nil {
		return nil, fmt.Errorf("rebuild reference projection: %w", err)
	}
	result := &domain.ImageReferenceRepairResult{RepairedAt: time.Now()}
	if err := tx.QueryRow(ctx, `SELECT COUNT(*), COALESCE(SUM(ref_count), 0) FROM image_references`).Scan(&result.ReferencedImages, &result.TotalRefCount); err != nil {
		return nil, fmt.Errorf("count rebuilt references: %w", err)
	}
	if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM images`).Scan(&result.ProcessedImages); err != nil {
		return nil, fmt.Errorf("count images: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit projection repair: %w", err)
	}
	return result, nil
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

type postgresProjectRepository PostgresRepository

func (r *postgresProjectRepository) List(ctx context.Context) ([]*domain.Project, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT p.id, p.title, p.summary, p.link_url, p.cover_image_id, p.sort_order,
		       p.created_at, p.updated_at,
		       i.id, i.album_id, i.object_key, i.thumbnail_object_key, i.url, i.thumbnail_url,
		       i.file_name, i.file_size, i.mime_type, i.created_at
		FROM projects p
		INNER JOIN images i ON i.id = p.cover_image_id
		ORDER BY p.sort_order, p.created_at DESC, p.id
	`)
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}
	defer rows.Close()
	projects := make([]*domain.Project, 0)
	for rows.Next() {
		project, image, err := scanProject(rows)
		if err != nil {
			return nil, err
		}
		project.CoverImage = image
		projects = append(projects, project)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("project rows error: %w", err)
	}
	return projects, nil
}

func (r *postgresProjectRepository) Get(ctx context.Context, id string) (*domain.Project, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT p.id, p.title, p.summary, p.link_url, p.cover_image_id, p.sort_order,
		       p.created_at, p.updated_at,
		       i.id, i.album_id, i.object_key, i.thumbnail_object_key, i.url, i.thumbnail_url,
		       i.file_name, i.file_size, i.mime_type, i.created_at
		FROM projects p INNER JOIN images i ON i.id = p.cover_image_id WHERE p.id = $1
	`, id)
	project, image, err := scanProject(row)
	if err != nil {
		return nil, fmt.Errorf("get project: %w", err)
	}
	project.CoverImage = image
	return project, nil
}

func (r *postgresProjectRepository) Create(ctx context.Context, project *domain.Project) (*domain.Project, error) {
	if project.ID == "" {
		id, err := uuid.NewV7()
		if err == nil {
			project.ID = id.String()
		} else {
			project.ID = xid.New().String()
		}
	}
	if project.CreatedAt.IsZero() {
		project.CreatedAt = time.Now()
	}
	project.UpdatedAt = project.CreatedAt
	if _, err := r.pool.Exec(ctx, `INSERT INTO projects (id,title,summary,link_url,cover_image_id,sort_order,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, project.ID, project.Title, project.Summary, project.LinkURL, project.CoverImageID, project.SortOrder, project.CreatedAt, project.UpdatedAt); err != nil {
		return nil, fmt.Errorf("create project: %w", err)
	}
	return r.Get(ctx, project.ID)
}

func (r *postgresProjectRepository) Update(ctx context.Context, project *domain.Project) (*domain.Project, error) {
	project.UpdatedAt = time.Now()
	if _, err := r.pool.Exec(ctx, `UPDATE projects SET title=$2, summary=$3, link_url=$4, cover_image_id=$5, updated_at=$6 WHERE id=$1`, project.ID, project.Title, project.Summary, project.LinkURL, project.CoverImageID, project.UpdatedAt); err != nil {
		return nil, fmt.Errorf("update project: %w", err)
	}
	return r.Get(ctx, project.ID)
}

func (r *postgresProjectRepository) Delete(ctx context.Context, id string) error {
	if _, err := r.pool.Exec(ctx, `DELETE FROM projects WHERE id = $1`, id); err != nil {
		return fmt.Errorf("delete project: %w", err)
	}
	return nil
}

func (r *postgresProjectRepository) Reorder(ctx context.Context, ids []string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin reorder projects: %w", err)
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, `UPDATE projects p SET sort_order = u.position - 1, updated_at = NOW() FROM unnest($1::text[]) WITH ORDINALITY AS u(id, position) WHERE p.id = u.id`, ids)
	if err != nil {
		return fmt.Errorf("reorder projects: %w", err)
	}
	if int(tag.RowsAffected()) != len(ids) {
		return fmt.Errorf("reorder projects: expected %d rows, updated %d", len(ids), tag.RowsAffected())
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit reorder projects: %w", err)
	}
	return nil
}

type postgresAboutRepository PostgresRepository

func (r *postgresAboutRepository) ListImages(ctx context.Context) ([]*domain.AboutImage, error) {
	rows, err := r.pool.Query(ctx, `SELECT a.id,a.image_id,a.sort_order,a.created_at,i.id,i.album_id,i.object_key,i.thumbnail_object_key,i.url,i.thumbnail_url,i.file_name,i.file_size,i.mime_type,i.created_at FROM about_images a INNER JOIN images i ON i.id=a.image_id ORDER BY a.sort_order,a.created_at,a.id`)
	if err != nil {
		return nil, fmt.Errorf("list about images: %w", err)
	}
	defer rows.Close()
	result := make([]*domain.AboutImage, 0)
	for rows.Next() {
		var item domain.AboutImage
		image, err := scanAboutImage(rows, &item)
		if err != nil {
			return nil, err
		}
		item.Image = image
		result = append(result, &item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("about image rows error: %w", err)
	}
	return result, nil
}

func (r *postgresAboutRepository) AddImage(ctx context.Context, image *domain.AboutImage) (*domain.AboutImage, error) {
	if image.ID == "" {
		id, err := uuid.NewV7()
		if err == nil {
			image.ID = id.String()
		} else {
			image.ID = xid.New().String()
		}
	}
	if image.CreatedAt.IsZero() {
		image.CreatedAt = time.Now()
	}
	if _, err := r.pool.Exec(ctx, `INSERT INTO about_images (id,image_id,sort_order,created_at) VALUES ($1,$2,$3,$4)`, image.ID, image.ImageID, image.SortOrder, image.CreatedAt); err != nil {
		return nil, fmt.Errorf("add about image: %w", err)
	}
	items, err := r.ListImages(ctx)
	if err != nil {
		return nil, err
	}
	for _, item := range items {
		if item.ID == image.ID {
			return item, nil
		}
	}
	return nil, fmt.Errorf("about image %s not found after insert", image.ID)
}

func (r *postgresAboutRepository) RemoveImage(ctx context.Context, id string) error {
	if _, err := r.pool.Exec(ctx, `DELETE FROM about_images WHERE id=$1`, id); err != nil {
		return fmt.Errorf("remove about image: %w", err)
	}
	return nil
}

func (r *postgresAboutRepository) ReorderImages(ctx context.Context, ids []string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin reorder about images: %w", err)
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, `UPDATE about_images a SET sort_order = u.position - 1 FROM unnest($1::text[]) WITH ORDINALITY AS u(id, position) WHERE a.id = u.id`, ids)
	if err != nil {
		return fmt.Errorf("reorder about images: %w", err)
	}
	if int(tag.RowsAffected()) != len(ids) {
		return fmt.Errorf("reorder about images: expected %d rows, updated %d", len(ids), tag.RowsAffected())
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit reorder about images: %w", err)
	}
	return nil
}

func scanProject(row imageScanner) (*domain.Project, *domain.Image, error) {
	var p domain.Project
	var image domain.Image
	var objectKey, thumbKey, url, thumbURL sql.NullString
	if err := row.Scan(&p.ID, &p.Title, &p.Summary, &p.LinkURL, &p.CoverImageID, &p.SortOrder, &p.CreatedAt, &p.UpdatedAt, &image.ID, &image.AlbumID, &objectKey, &thumbKey, &url, &thumbURL, &image.FileName, &image.FileSize, &image.MimeType, &image.CreatedAt); err != nil {
		return nil, nil, fmt.Errorf("scan project: %w", err)
	}
	if objectKey.Valid {
		image.ObjectKey = objectKey.String
	}
	if thumbKey.Valid {
		image.ThumbnailObjectKey = thumbKey.String
	}
	if url.Valid {
		image.URL = url.String
	}
	if thumbURL.Valid {
		image.ThumbnailURL = thumbURL.String
	}
	return &p, &image, nil
}

func scanAboutImage(row imageScanner, item *domain.AboutImage) (*domain.Image, error) {
	var image domain.Image
	var objectKey, thumbKey, url, thumbURL sql.NullString
	if err := row.Scan(&item.ID, &item.ImageID, &item.SortOrder, &item.CreatedAt, &image.ID, &image.AlbumID, &objectKey, &thumbKey, &url, &thumbURL, &image.FileName, &image.FileSize, &image.MimeType, &image.CreatedAt); err != nil {
		return nil, fmt.Errorf("scan about image: %w", err)
	}
	if objectKey.Valid {
		image.ObjectKey = objectKey.String
	}
	if thumbKey.Valid {
		image.ThumbnailObjectKey = thumbKey.String
	}
	if url.Valid {
		image.URL = url.String
	}
	if thumbURL.Valid {
		image.ThumbnailURL = thumbURL.String
	}
	return &image, nil
}

func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{Valid: false}
	}
	return sql.NullString{String: s, Valid: true}
}
