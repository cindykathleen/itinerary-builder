ALTER TABLE itineraries
  ADD COLUMN planning_mode VARCHAR(20) NOT NULL DEFAULT 'timeline',
  ADD CONSTRAINT valid_planning_mode
    CHECK (planning_mode IN ('timeline', 'sections'));

CREATE TABLE itinerary_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  itinerary_id UUID NOT NULL,

  name VARCHAR(40) NOT NULL,
  position INTEGER NOT NULL,

  CONSTRAINT fk_section_itinerary
    FOREIGN KEY (itinerary_id)
    REFERENCES itineraries(id)
    ON DELETE CASCADE,

  CONSTRAINT unique_section_itinerary
    UNIQUE (id, itinerary_id),

  CONSTRAINT unique_section_position
    UNIQUE (itinerary_id, position),

  CONSTRAINT valid_section_name
    CHECK (
      name = btrim(name)
      AND char_length(name) BETWEEN 1 AND 40
    )
);

CREATE UNIQUE INDEX unique_section_name_per_itinerary
  ON itinerary_sections (itinerary_id, lower(name));

ALTER TABLE activities
  ADD COLUMN section_id UUID,
  ADD COLUMN section_date DATE,
  ADD COLUMN position INTEGER,
  ADD CONSTRAINT fk_activity_section
    FOREIGN KEY (section_id, itinerary_id)
    REFERENCES itinerary_sections(id, itinerary_id)
    ON DELETE SET NULL (section_id),
  ADD CONSTRAINT activity_section_placement
    CHECK (
      (
        section_id IS NULL
        AND section_date IS NULL
        AND position IS NULL
      )
      OR
      (
        section_id IS NOT NULL
        AND section_date IS NOT NULL
        AND position IS NOT NULL
        AND position >= 0
        AND start_at IS NULL
        AND end_at IS NULL
        AND in_sidebar = false
      )
    );

CREATE UNIQUE INDEX unique_activity_section_position
  ON activities (section_id, section_date, position)
  WHERE section_id IS NOT NULL;

CREATE FUNCTION return_section_activities_to_sidebar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE activities
  SET section_id = NULL,
      section_date = NULL,
      position = NULL,
      in_sidebar = true,
      updated_at = CURRENT_TIMESTAMP
  WHERE section_id = OLD.id;

  RETURN OLD;
END;
$$;

CREATE TRIGGER itinerary_sections_return_activities
  BEFORE DELETE ON itinerary_sections
  FOR EACH ROW
  EXECUTE FUNCTION return_section_activities_to_sidebar();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cindy') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON itinerary_sections TO cindy;
  END IF;
END $$;
