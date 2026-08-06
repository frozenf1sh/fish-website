-- First-class public content for the project and about pages.
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    link_url VARCHAR(2048) NOT NULL DEFAULT '',
    cover_image_id VARCHAR(64) NOT NULL REFERENCES images(id) ON DELETE RESTRICT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_sort_order
    ON projects(sort_order, created_at DESC, id);

CREATE TABLE IF NOT EXISTS about_images (
    id VARCHAR(64) PRIMARY KEY,
    image_id VARCHAR(64) NOT NULL REFERENCES images(id) ON DELETE RESTRICT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (image_id)
);

CREATE INDEX IF NOT EXISTS idx_about_images_sort_order
    ON about_images(sort_order, created_at, id);

-- Extend the canonical reference fact type check for the new content modules.
ALTER TABLE image_reference_sources
    DROP CONSTRAINT IF EXISTS image_reference_sources_source_type_check;
ALTER TABLE image_reference_sources
    ADD CONSTRAINT image_reference_sources_source_type_check
    CHECK (source_type IN ('post', 'blog', 'avatar', 'background', 'favicon', 'project', 'about'));

-- Existing project/about records are empty, so only the settings and legacy
-- content facts need to be preserved by the projection rebuild. New records
-- are populated by the application through image-ID facts.
