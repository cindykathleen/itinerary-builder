CREATE TABLE itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  owner_id UUID NOT NULL,

  name VARCHAR(255) NOT NULL,

  date_start DATE NOT NULL,
  date_end DATE NOT NULL,

  day_start TIME NOT NULL,
  day_end TIME NOT NULL,

  time_interval SMALLINT NOT NULL,
  time_format VARCHAR(3) NOT NULL,

  timezone VARCHAR(100) NOT NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'active',

  photo_url TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_itinerary_owner
    FOREIGN KEY (owner_id)
    REFERENCES users(id),

  CONSTRAINT valid_date_range
    CHECK (date_start <= date_end),

  CONSTRAINT valid_time_interval
    CHECK (time_interval IN (30, 60)),

  CONSTRAINT valid_time_format
    CHECK (time_format IN ('12h', '24h')),

  CONSTRAINT valid_status
    CHECK (status IN ('active', 'archived', 'trashed'))
);