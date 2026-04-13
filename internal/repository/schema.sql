-- Database schema for fish-website

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
    id VARCHAR(64) PRIMARY KEY,
    content TEXT NOT NULL,
    image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

-- Folders table (for blog categorization)
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

-- Articles table
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

-- Albums table
CREATE TABLE IF NOT EXISTS albums (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_albums_is_public ON albums(is_public);

-- Images table
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

-- Image reference counters for posts/blog/settings usage analysis
CREATE TABLE IF NOT EXISTS image_references (
    image_id VARCHAR(64) PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
    ref_count INTEGER NOT NULL DEFAULT 0,
    post_ref_count INTEGER NOT NULL DEFAULT 0,
    blog_ref_count INTEGER NOT NULL DEFAULT 0,
    avatar_ref_count INTEGER NOT NULL DEFAULT 0,
    background_ref_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_image_references_ref_count ON image_references(ref_count);

-- Settings table (we'll store only one row)
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    display_name VARCHAR(255),
    bio TEXT,
    avatar_url VARCHAR(2048),
    twitter_url VARCHAR(2048),
    github_url VARCHAR(2048),
    bilibili_url VARCHAR(2048),
    custom_links TEXT, -- JSON string
    background_image_url VARCHAR(2048),
    sakura_particles_enabled BOOLEAN NOT NULL DEFAULT true,
    theme_color VARCHAR(32),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Insert default settings if not exists
INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
