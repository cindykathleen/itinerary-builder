ALTER TABLE categories
  ADD COLUMN logistics BOOLEAN NOT NULL DEFAULT false;

INSERT INTO categories (itinerary_id, name, color, logistics, created_at)
SELECT id, 'Transportation', '#DDEDE7', true, clock_timestamp()
FROM itineraries
WHERE NOT EXISTS (
  SELECT 1
  FROM categories
  WHERE categories.itinerary_id = itineraries.id
    AND categories.logistics = true
    AND categories.name = 'Transportation'
);

INSERT INTO categories (itinerary_id, name, color, logistics, created_at)
SELECT id, 'Accommodations', '#E8DFF0', true, clock_timestamp()
FROM itineraries
WHERE NOT EXISTS (
  SELECT 1
  FROM categories
  WHERE categories.itinerary_id = itineraries.id
    AND categories.logistics = true
    AND categories.name = 'Accommodations'
);
