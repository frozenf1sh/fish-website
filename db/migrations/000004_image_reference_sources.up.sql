-- Canonical image-reference facts. Legacy posts.image_urls and article
-- Markdown remain readable, but all future counters are derived from IDs.
CREATE TABLE IF NOT EXISTS image_reference_sources (
    source_type TEXT NOT NULL CHECK (source_type IN ('post', 'blog', 'avatar', 'background', 'favicon')),
    source_id TEXT NOT NULL,
    image_id VARCHAR(64) NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    occurrence_count INTEGER NOT NULL CHECK (occurrence_count > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (source_type, source_id, image_id)
);

CREATE INDEX IF NOT EXISTS idx_image_reference_sources_image
    ON image_reference_sources(image_id);

-- Posts: one fact per image and source post, preserving duplicate occurrences.
INSERT INTO image_reference_sources (source_type, source_id, image_id, occurrence_count)
SELECT 'post', p.id, i.id, COUNT(*)::int
FROM posts p
CROSS JOIN LATERAL jsonb_array_elements_text(p.image_urls) AS u(url)
INNER JOIN images i ON i.url = u.url
GROUP BY p.id, i.id
ON CONFLICT (source_type, source_id, image_id) DO UPDATE
SET occurrence_count = EXCLUDED.occurrence_count, updated_at = NOW();

-- Blogs: the pattern intentionally matches the same Markdown form used by
-- the application parser.
INSERT INTO image_reference_sources (source_type, source_id, image_id, occurrence_count)
SELECT 'blog', a.id, i.id, COUNT(*)::int
FROM articles a
CROSS JOIN LATERAL regexp_matches(a.content, '!\[[^\]]*\]\(([^)]+)\)', 'g') AS m
INNER JOIN images i ON i.url = m[1]
GROUP BY a.id, i.id
ON CONFLICT (source_type, source_id, image_id) DO UPDATE
SET occurrence_count = EXCLUDED.occurrence_count, updated_at = NOW();

INSERT INTO image_reference_sources (source_type, source_id, image_id, occurrence_count)
SELECT 'avatar', 'settings:1', i.id, 1
FROM settings s
INNER JOIN images i ON i.url = s.avatar_url
WHERE s.id = 1 AND COALESCE(s.avatar_url, '') <> ''
ON CONFLICT (source_type, source_id, image_id) DO UPDATE
SET occurrence_count = EXCLUDED.occurrence_count, updated_at = NOW();

INSERT INTO image_reference_sources (source_type, source_id, image_id, occurrence_count)
SELECT 'background', 'settings:1', i.id, 1
FROM settings s
INNER JOIN images i ON i.url = s.background_image_url
WHERE s.id = 1 AND COALESCE(s.background_image_url, '') <> ''
ON CONFLICT (source_type, source_id, image_id) DO UPDATE
SET occurrence_count = EXCLUDED.occurrence_count, updated_at = NOW();

INSERT INTO image_reference_sources (source_type, source_id, image_id, occurrence_count)
SELECT 'favicon', 'settings:1', i.id, 1
FROM settings s
INNER JOIN images i ON i.url = (s.custom_links::jsonb ->> 'siteFaviconUrl')
WHERE s.id = 1
  AND COALESCE(s.custom_links, '') <> ''
  AND COALESCE((s.custom_links::jsonb ->> 'siteFaviconUrl'), '') <> ''
ON CONFLICT (source_type, source_id, image_id) DO UPDATE
SET occurrence_count = EXCLUDED.occurrence_count, updated_at = NOW();

-- Rebuild the denormalized projection once from canonical facts.
TRUNCATE TABLE image_references;
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
GROUP BY image_id;
