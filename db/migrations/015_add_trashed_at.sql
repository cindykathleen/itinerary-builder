ALTER TABLE itineraries
  ADD COLUMN trashed_at TIMESTAMPTZ;

UPDATE itineraries
SET trashed_at = updated_at
WHERE status = 'trashed';

ALTER TABLE itineraries
  ADD CONSTRAINT trashed_at_matches_status
    CHECK (
      (status = 'trashed' AND trashed_at IS NOT NULL)
      OR (status <> 'trashed' AND trashed_at IS NULL)
    );

CREATE INDEX idx_itineraries_trashed_at
  ON itineraries (trashed_at)
  WHERE status = 'trashed';
