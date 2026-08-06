-- Reference rebuilds join source URLs to images. Keep that lookup indexed as
-- the media catalog grows; the partial predicate avoids indexing pending rows.
CREATE INDEX IF NOT EXISTS idx_images_url
    ON images(url)
    WHERE url IS NOT NULL;
