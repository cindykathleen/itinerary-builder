CREATE TABLE itinerary_day_settings (
  itinerary_id UUID NOT NULL,

  date DATE NOT NULL,

  heading TEXT,

  CONSTRAINT pk_itinerary_day_settings
    PRIMARY KEY (itinerary_id, date),

  CONSTRAINT fk_day_setting_itinerary
    FOREIGN KEY (itinerary_id)
    REFERENCES itineraries(id)
    ON DELETE CASCADE
);