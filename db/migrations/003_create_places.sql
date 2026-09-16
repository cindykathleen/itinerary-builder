CREATE TABLE places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  itinerary_id UUID NOT NULL,

  google_place_id VARCHAR(255) NOT NULL,

  name VARCHAR(255) NOT NULL,
  address VARCHAR(255) NOT NULL,

  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_place_itinerary
    FOREIGN KEY (itinerary_id)
    REFERENCES itineraries(id)
    ON DELETE CASCADE,
  
  CONSTRAINT unique_place_per_itinerary 
    UNIQUE (itinerary_id, google_place_id),

  CONSTRAINT unique_place_itinerary
    UNIQUE (id, itinerary_id),

  CONSTRAINT valid_latitude
    CHECK (latitude BETWEEN -90 AND 90),

  CONSTRAINT valid_longitude
    CHECK (longitude BETWEEN -180 AND 180)
);