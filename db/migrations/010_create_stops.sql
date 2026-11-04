CREATE TABLE stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  itinerary_id UUID NOT NULL,

  name VARCHAR(255) NOT NULL,
  position INTEGER NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_stop_itinerary
    FOREIGN KEY (itinerary_id)
    REFERENCES itineraries(id)
    ON DELETE CASCADE,

  CONSTRAINT unique_stop_itinerary
    UNIQUE (id, itinerary_id)
);

CREATE INDEX idx_stops_itinerary_position
  ON stops(itinerary_id, position);

ALTER TABLE activities
  ADD COLUMN stop_id UUID,
  ADD CONSTRAINT fk_activity_stop
    FOREIGN KEY (stop_id, itinerary_id)
    REFERENCES stops(id, itinerary_id)
    ON DELETE SET NULL (stop_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cindy') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON stops TO cindy;
  END IF;
END $$;
