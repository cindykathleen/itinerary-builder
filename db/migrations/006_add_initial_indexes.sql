CREATE INDEX idx_itineraries_owner_id
  ON itineraries(owner_id);

CREATE INDEX idx_activities_itinerary_start
  ON activities(itinerary_id, start_at);