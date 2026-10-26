ALTER TABLE categories
  ADD COLUMN stop_id UUID;

UPDATE activities
SET category_id = NULL
WHERE stop_id IS NULL
  AND category_id IN (
    SELECT id FROM categories WHERE logistics = false
  );

DO $$
DECLARE
  category_row RECORD;
  place_row RECORD;
  primary_stop UUID;
  copy_id UUID;
BEGIN
  FOR category_row IN
    SELECT id, itinerary_id, name, color, created_at
    FROM categories
    WHERE logistics = false
  LOOP
    SELECT stop_id INTO primary_stop
    FROM activities
    WHERE category_id = category_row.id
      AND stop_id IS NOT NULL
    GROUP BY stop_id
    ORDER BY COUNT(*) DESC, stop_id
    LIMIT 1;

    IF primary_stop IS NULL THEN
      SELECT id INTO primary_stop
      FROM stops
      WHERE itinerary_id = category_row.itinerary_id
      ORDER BY position, created_at, name
      LIMIT 1;
    END IF;

    UPDATE categories
    SET stop_id = primary_stop
    WHERE id = category_row.id;

    FOR place_row IN
      SELECT DISTINCT stop_id
      FROM activities
      WHERE category_id = category_row.id
        AND stop_id IS NOT NULL
        AND stop_id IS DISTINCT FROM primary_stop
    LOOP
      INSERT INTO categories (itinerary_id, name, color, logistics, stop_id, created_at)
      VALUES (
        category_row.itinerary_id,
        category_row.name,
        category_row.color,
        false,
        place_row.stop_id,
        category_row.created_at
      )
      RETURNING id INTO copy_id;

      UPDATE activities
      SET category_id = copy_id
      WHERE category_id = category_row.id
        AND stop_id = place_row.stop_id;
    END LOOP;
  END LOOP;
END $$;

DELETE FROM categories
WHERE logistics = false
  AND stop_id IS NULL;

ALTER TABLE categories
  ADD CONSTRAINT fk_category_stop
    FOREIGN KEY (stop_id, itinerary_id)
    REFERENCES stops(id, itinerary_id)
    ON DELETE CASCADE,
  ADD CONSTRAINT category_place_scope CHECK (
    (logistics = true AND stop_id IS NULL)
    OR (logistics = false AND stop_id IS NOT NULL)
  );
