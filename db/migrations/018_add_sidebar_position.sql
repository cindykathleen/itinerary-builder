ALTER TABLE activities
  ADD COLUMN sidebar_position INTEGER,
  ADD CONSTRAINT valid_sidebar_position
    CHECK (sidebar_position IS NULL OR sidebar_position >= 0);

WITH ordered AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY itinerary_id, category_id
           ORDER BY (start_at IS NOT NULL), created_at, name, id
         ) - 1 AS next_position
  FROM activities
  WHERE in_sidebar = true
)
UPDATE activities
SET sidebar_position = ordered.next_position
FROM ordered
WHERE activities.id = ordered.id;
