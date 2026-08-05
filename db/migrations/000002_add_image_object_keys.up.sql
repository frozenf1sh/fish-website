-- Persist provider-neutral object keys independently from browser-facing URLs.
-- Existing URLs remain as a compatibility read path while keys are backfilled.

ALTER TABLE images ADD COLUMN IF NOT EXISTS object_key VARCHAR(1024);
ALTER TABLE images ADD COLUMN IF NOT EXISTS thumbnail_object_key VARCHAR(1024);

-- Both legacy MinIO and the R2 custom delivery domain place objects beneath
-- images/. Preserve only that stable S3 key, never an endpoint or bucket URL.
UPDATE images
SET object_key = substring(url FROM '(images/[^?#]+)')
WHERE object_key IS NULL
  AND url IS NOT NULL
  AND url ~ '(^|/)images/';

UPDATE images
SET thumbnail_object_key = substring(thumbnail_url FROM '(images/[^?#]+)')
WHERE thumbnail_object_key IS NULL
  AND thumbnail_url IS NOT NULL
  AND thumbnail_url ~ '(^|/)images/';

CREATE UNIQUE INDEX IF NOT EXISTS idx_images_object_key
    ON images(object_key)
    WHERE object_key IS NOT NULL;
