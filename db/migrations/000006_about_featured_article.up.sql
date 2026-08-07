-- Store the single blog article referenced by the public about page.
CREATE TABLE IF NOT EXISTS about_page_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    featured_article_id VARCHAR(64) REFERENCES articles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO about_page_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
