ALTER TABLE itineraries
  ADD COLUMN schedule_configured BOOLEAN NOT NULL DEFAULT false;

UPDATE itineraries
SET schedule_configured = true;
