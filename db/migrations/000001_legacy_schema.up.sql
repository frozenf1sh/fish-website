-- Bootstrap the pre-existing fish-website schema into the migration ledger.
-- This migration is intentionally idempotent so existing databases can adopt
-- the ledger without a destructive dump/restore.

CREATE TABLE IF NOT EXISTS posts (
    id VARCHAR(64) PRIMARY KEY,
    content TEXT NOT NULL,
    image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

CREATE TABLE IF NOT EXISTS folders (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_folder_id VARCHAR(64) REFERENCES folders(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_folder_id);

INSERT INTO folders (id, name, parent_folder_id)
VALUES ('root', '根目录', NULL)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS articles (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    folder_id VARCHAR(64) REFERENCES folders(id) ON DELETE SET NULL,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(16) NOT NULL DEFAULT 'published',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE articles ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'published';
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_folder_id ON articles(folder_id);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);

CREATE TABLE IF NOT EXISTS albums (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_albums_is_public ON albums(is_public);

CREATE TABLE IF NOT EXISTS images (
    id VARCHAR(64) PRIMARY KEY,
    album_id VARCHAR(64) NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    url VARCHAR(2048),
    thumbnail_url VARCHAR(2048),
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_images_album_id ON images(album_id);

CREATE TABLE IF NOT EXISTS image_references (
    image_id VARCHAR(64) PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
    ref_count INTEGER NOT NULL DEFAULT 0,
    post_ref_count INTEGER NOT NULL DEFAULT 0,
    blog_ref_count INTEGER NOT NULL DEFAULT 0,
    avatar_ref_count INTEGER NOT NULL DEFAULT 0,
    background_ref_count INTEGER NOT NULL DEFAULT 0,
    favicon_ref_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE image_references ADD COLUMN IF NOT EXISTS favicon_ref_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_image_references_ref_count ON image_references(ref_count);

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    display_name VARCHAR(255),
    bio TEXT,
    avatar_url VARCHAR(2048),
    twitter_url VARCHAR(2048),
    github_url VARCHAR(2048),
    bilibili_url VARCHAR(2048),
    custom_links TEXT,
    background_image_url VARCHAR(2048),
    sakura_particles_enabled BOOLEAN NOT NULL DEFAULT true,
    theme_color VARCHAR(32),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
