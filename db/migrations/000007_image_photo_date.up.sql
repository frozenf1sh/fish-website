-- Store an owner-assigned calendar date separately from upload time.
-- Existing images remain grouped by their upload date through the read fallback.
ALTER TABLE images ADD COLUMN IF NOT EXISTS photo_date DATE;

CREATE INDEX IF NOT EXISTS idx_images_album_photo_date
    ON images(album_id, photo_date DESC, created_at DESC);
