CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  itinerary_id UUID NOT NULL,
  
  category_id UUID,
  place_id UUID,

  name VARCHAR(255) NOT NULL,
  note TEXT,

  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_activity_itinerary
    FOREIGN KEY (itinerary_id)
    REFERENCES itineraries(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_activity_category
    FOREIGN KEY (category_id, itinerary_id)
    REFERENCES categories(id, itinerary_id)
    ON DELETE SET NULL (category_id),

  CONSTRAINT fk_activity_place
    FOREIGN KEY (place_id, itinerary_id)
    REFERENCES places(id, itinerary_id)
    ON DELETE SET NULL (place_id),

  CONSTRAINT valid_activity_time
    CHECK (
      (start_at IS NULL AND end_at IS NULL)
      OR
      (
        start_at IS NOT NULL
        AND end_at IS NOT NULL
        AND end_at > start_at
      )
    )
);