CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  itinerary_id UUID NOT NULL,

  name VARCHAR(255) NOT NULL,
  color VARCHAR(7) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_category_itinerary
    FOREIGN KEY (itinerary_id)
    REFERENCES itineraries(id)
    ON DELETE CASCADE,

  CONSTRAINT unique_category_itinerary
    UNIQUE (id, itinerary_id),

  CONSTRAINT valid_color
    CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);