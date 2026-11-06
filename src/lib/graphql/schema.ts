import { GraphQLError } from "graphql";
import { createSchema } from "graphql-yoga";
import type { PoolClient } from "pg";
import pool from "@/lib/db";
import { getGooglePlace, GooglePlacesError, type GooglePlace } from "@/lib/google-places";
import { reorderSidebarActivities } from "@/lib/sidebar-order";
import { sectionNames } from "@/lib/sections";
import { clockTime } from "@/lib/timeline";
import type { GraphQLContext } from "./context";

type ItineraryRow = {
  id: string;
  name: string;
  date_start: string;
  date_end: string;
  day_start: string;
  day_end: string;
  time_interval: number;
  time_format: "12h" | "24h";
  status: "active" | "archived" | "trashed";
  photo_url: string | null;
  schedule_configured: boolean;
  planning_mode: "timeline" | "sections";
};

function toItinerary(row: ItineraryRow) {
  return {
    id: row.id,
    name: row.name,
    dateStart: row.date_start,
    dateEnd: row.date_end,
    dayStart: row.day_start.slice(0, 5),
    dayEnd: row.day_end.slice(0, 5),
    timeInterval: Number(row.time_interval),
    timeFormat: row.time_format,
    status: row.status,
    photoUrl: row.photo_url,
    scheduleConfigured: row.schedule_configured,
    planningMode: row.planning_mode,
  };
}

const itineraryColumns = `
  id,
  name,
  date_start::text AS date_start,
  date_end::text AS date_end,
  day_start::text AS day_start,
  day_end::text AS day_end,
  time_interval,
  time_format,
  status,
  photo_url,
  schedule_configured,
  planning_mode
`;

const TRASH_RETENTION = "14 days";

async function purgeExpiredTrash() {
  await pool.query(
    `DELETE FROM itineraries
     WHERE status = 'trashed'
       AND trashed_at <= CURRENT_TIMESTAMP - $1::interval`,
    [TRASH_RETENTION],
  );
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/;
const DEFAULT_CATEGORY_COLOR = "#E0E6ED"; // --surface

function placeNames(values: string[]) {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    for (const part of value.split(",")) {
      const name = part.trim();

      if (!name) {
        continue;
      }

      if (name.length > 255) {
        throw new GraphQLError("Place name must be 255 characters or fewer.", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const key = name.toLocaleLowerCase();

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      names.push(name);
    }
  }

  return names;
}

function parseIsoDate(value: string) {
  if (!DATE_PATTERN.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }

  return value;
}

function parseTime(value: string) {
  const time = value.trim().slice(0, 5);

  if (!TIME_PATTERN.test(time)) {
    return null;
  }

  return time;
}

async function compactSectionPositions(
  client: PoolClient,
  sectionId: string,
  sectionDate: string,
) {
  await client.query(
    `WITH ordered AS (
       SELECT id,
              ROW_NUMBER() OVER (ORDER BY position, id) - 1 AS next_position
       FROM activities
       WHERE section_id = $1
         AND section_date = $2
     )
     UPDATE activities
     SET position = ordered.next_position
     FROM ordered
     WHERE activities.id = ordered.id
       AND activities.position IS DISTINCT FROM ordered.next_position`,
    [sectionId, sectionDate],
  );
}

function addUtcDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseScheduleEnd(value: string) {
  const match = /^(\d+):([0-5]\d)$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isInteger(hours) || hours > 24 * 366) {
    return null;
  }

  if (hours >= 24 && hours % 24 === 0 && minutes === 0) {
    return { extraDays: hours / 24 - 1, time: "24:00" };
  }

  const time = `${String(hours % 24).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

  if (!parseTime(time)) {
    return null;
  }

  return { extraDays: Math.floor(hours / 24), time };
}

function minutesFromTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function validScheduleRange(
  dayStart: string,
  dayEnd: string,
  interval: number,
  startTime: string,
  endTime: string,
) {
  if (interval !== 30 && interval !== 60) {
    return false;
  }

  const start = minutesFromTime(dayStart);
  const end = minutesFromTime(dayEnd);
  const slot = minutesFromTime(startTime);
  const finish = minutesFromTime(endTime);
  const latest = end + interval;
  const onGrid = (slot - start) % interval === 0;

  if (slot < start || slot > end || (slot !== end && !onGrid)) {
    return false;
  }

  if (finish <= slot || finish > latest) {
    return false;
  }

  return finish === end || finish === latest || (finish - start) % interval === 0;
}

function parseHexColor(value: string) {
  const digits = value.trim().replace(/^#/, "");

  if (digits === "") {
    return DEFAULT_CATEGORY_COLOR;
  }

  if (!/^[0-9A-Fa-f]{6}$/.test(digits)) {
    return null;
  }

  return `#${digits}`;
}

async function assertCategoryMatchesPlace(
  categoryId: string,
  itineraryId: string,
  stopId: string | null,
) {
  const category = await pool.query<{ stop_id: string | null }>(
    `SELECT stop_id
     FROM categories
     WHERE id = $1 AND itinerary_id = $2`,
    [categoryId, itineraryId],
  );
  const row = category.rows[0];

  if (!row) {
    throw new GraphQLError("Category not found.", {
      extensions: { code: "NOT_FOUND" },
    });
  }

  if ((row.stop_id ?? null) !== stopId) {
    throw new GraphQLError("Choose a category for this place.", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
}

async function savedGooglePlace(
  itineraryId: string,
  googlePlaceId: string | null | undefined,
  sessionToken: string | null | undefined,
) {
  const placeId = googlePlaceId?.trim() ?? "";

  if (!placeId) {
    return null;
  }

  let place: GooglePlace;

  try {
    place = await getGooglePlace(placeId, sessionToken?.trim() || null);
  } catch (error) {
    if (error instanceof GooglePlacesError) {
      throw new GraphQLError(error.message, {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    throw error;
  }

  const result = await pool.query<{ id: string }>(
    `INSERT INTO places (
       itinerary_id, google_place_id, name, address, latitude, longitude
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (itinerary_id, google_place_id)
     DO UPDATE SET
       name = EXCLUDED.name,
       address = EXCLUDED.address,
       latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude
     RETURNING id`,
    [itineraryId, place.placeId, place.name, place.address, place.latitude, place.longitude],
  );

  return result.rows[0].id;
}

export const schema = createSchema({
  typeDefs: /* GraphQL */ `
    enum ItineraryStatus {
      active
      archived
      trashed
    }

    enum PlanningMode {
      timeline
      sections
    }

    type Itinerary {
      id: ID!
      name: String!
      dateStart: String!
      dateEnd: String!
      dayStart: String!
      dayEnd: String!
      timeInterval: Int!
      timeFormat: String!
      status: ItineraryStatus!
      photoUrl: String
      scheduleConfigured: Boolean!
      planningMode: PlanningMode!
      daySettings: [ItineraryDay!]!
      categories: [Category!]!
      stops: [Stop!]!
      sections: [ItinerarySection!]!
      googlePlaces: [ItineraryPlace!]!
      activities: [Activity!]!
    }

    type ItineraryDay {
      date: String!
      heading: String
    }

    type Category {
      id: ID!
      name: String!
      color: String!
      logistics: Boolean!
      stopId: ID
    }

    type Stop {
      id: ID!
      name: String!
    }

    type ItinerarySection {
      id: ID!
      name: String!
      position: Int!
    }

    type ItineraryPlace {
      id: ID!
      googlePlaceId: String!
      name: String!
      address: String!
      latitude: Float!
      longitude: Float!
      color: String!
    }

    type Activity {
      id: ID!
      name: String!
      note: String
      categoryId: ID
      stopId: ID
      googlePlaceId: String
      googlePlaceName: String
      googlePlaceAddress: String
      inSidebar: Boolean!
      startDate: String
      startTime: String
      endTime: String
      sectionId: ID
      sectionDate: String
      position: Int
      sidebarPosition: Int
    }

    type Query {
      itineraries(status: ItineraryStatus!): [Itinerary!]!
      itinerary(id: ID!): Itinerary
    }

    type Mutation {
      createItinerary(
        name: String!
        dateStart: String!
        dateEnd: String!
      ): Itinerary!
      updateItineraryStatus(id: ID!, status: ItineraryStatus!): Itinerary!
      renameItinerary(id: ID!, name: String!): Itinerary!
      saveItinerarySchedule(
        id: ID!
        planningMode: PlanningMode!
        dayStart: String
        dayEnd: String
        timeInterval: Int
        places: [String!]!
        sections: [String!]
      ): Itinerary!
      saveItineraryDayHeading(id: ID!, date: String!, heading: String!): Boolean!
      updateItinerary(
        id: ID!
        name: String!
        dateStart: String!
        dateEnd: String!
        dayStart: String!
        dayEnd: String!
        timeInterval: Int!
      ): Itinerary!
      deleteItinerary(id: ID!): Boolean!
      createCategory(
        itineraryId: ID!
        name: String!
        color: String!
        stopId: ID
      ): Category!
      updateCategory(id: ID!, name: String!, color: String!): Category!
      deleteCategory(id: ID!): Boolean!
      createStop(itineraryId: ID!, name: String!): Stop!
      updateStop(id: ID!, name: String!): Stop!
      deleteStop(id: ID!): Boolean!
      createActivity(
        itineraryId: ID!
        name: String!
        note: String!
        categoryId: ID
        stopId: ID
        googlePlaceId: String
        sessionToken: String
        inSidebar: Boolean
        date: String
        startTime: String
        endTime: String
        sectionId: ID
      ): Activity!
      updateActivity(
        id: ID!
        name: String!
        note: String!
        categoryId: ID
        stopId: ID
        googlePlaceId: String
        sessionToken: String
        inSidebar: Boolean
      ): Activity!
      scheduleActivity(
        id: ID!
        itineraryId: ID!
        date: String!
        startTime: String!
        endTime: String!
      ): Boolean!
      unscheduleActivity(id: ID!, itineraryId: ID!): Boolean!
      placeActivityInSection(
        id: ID!
        itineraryId: ID!
        date: String!
        sectionId: ID!
        position: Int!
      ): Boolean!
      reorderSidebarActivity(id: ID!, itineraryId: ID!, beforeId: ID): Boolean!
      deleteActivity(id: ID!): Boolean!
    }
  `,
  resolvers: {
    Itinerary: {
      daySettings: async (parent: { id: string }) => {
        const result = await pool.query<{ date: string; heading: string | null }>(
          `SELECT date::text AS date, heading
           FROM itinerary_day_settings
           WHERE itinerary_id = $1
           ORDER BY date`,
          [parent.id],
        );

        return result.rows;
      },
      categories: async (parent: { id: string }) => {
        const result = await pool.query<{
          id: string;
          name: string;
          color: string;
          logistics: boolean;
          stopId: string | null;
        }>(
          `SELECT id, name, color, logistics, stop_id AS "stopId"
           FROM categories
           WHERE itinerary_id = $1
           ORDER BY created_at, name`,
          [parent.id],
        );

        return result.rows;
      },
      stops: async (parent: { id: string }) => {
        const result = await pool.query<{ id: string; name: string }>(
          `SELECT id, name
           FROM stops
           WHERE itinerary_id = $1
           ORDER BY position, created_at, name`,
          [parent.id],
        );

        return result.rows;
      },
      sections: async (parent: { id: string }) => {
        const result = await pool.query<{ id: string; name: string; position: number }>(
          `SELECT id, name, position
           FROM itinerary_sections
           WHERE itinerary_id = $1
           ORDER BY position`,
          [parent.id],
        );

        return result.rows.map((section) => ({
          id: section.id,
          name: section.name,
          position: Number(section.position),
        }));
      },
      googlePlaces: async (parent: { id: string }) => {
        const result = await pool.query<{
          id: string;
          google_place_id: string;
          name: string;
          address: string;
          latitude: number;
          longitude: number;
          color: string;
        }>(
          `SELECT id, google_place_id, name, address, latitude, longitude, color
           FROM (
             SELECT DISTINCT ON (places.id)
                    places.id,
                    places.google_place_id,
                    places.name,
                    places.address,
                    places.latitude,
                    places.longitude,
                    COALESCE(categories.color, '#E0E6ED') AS color
             FROM places
             JOIN activities ON activities.place_id = places.id
             LEFT JOIN categories ON categories.id = activities.category_id
             WHERE places.itinerary_id = $1
             ORDER BY places.id, activities.created_at
           ) linked_places
           ORDER BY name`,
          [parent.id],
        );

        return result.rows.map((place) => ({
          id: place.id,
          googlePlaceId: place.google_place_id,
          name: place.name,
          address: place.address,
          latitude: place.latitude,
          longitude: place.longitude,
          color: place.color,
        }));
      },
      activities: async (parent: { id: string }) => {
        const result = await pool.query<{
          id: string;
          name: string;
          note: string | null;
          category_id: string | null;
          stop_id: string | null;
          google_place_id: string | null;
          google_place_name: string | null;
          google_place_address: string | null;
          in_sidebar: boolean;
          start_date: string | null;
          start_time: string | null;
          end_date: string | null;
          end_time: string | null;
          section_id: string | null;
          section_date: string | null;
          position: number | null;
          sidebar_position: number | null;
        }>(
          `SELECT activities.id,
                  activities.name,
                  activities.note,
                  activities.category_id,
                  activities.stop_id,
                  places.google_place_id,
                  places.name AS google_place_name,
                  places.address AS google_place_address,
                  activities.in_sidebar,
                  to_char(activities.start_at AT TIME ZONE itineraries.timezone, 'YYYY-MM-DD') AS start_date,
                  to_char(activities.start_at AT TIME ZONE itineraries.timezone, 'HH24:MI') AS start_time,
                  to_char(activities.end_at AT TIME ZONE itineraries.timezone, 'YYYY-MM-DD') AS end_date,
                  to_char(activities.end_at AT TIME ZONE itineraries.timezone, 'HH24:MI') AS end_time,
                  activities.section_id,
                  activities.section_date::text AS section_date,
                  activities.position,
                  activities.sidebar_position
           FROM activities
           JOIN itineraries ON itineraries.id = activities.itinerary_id
           LEFT JOIN places ON places.id = activities.place_id
           WHERE activities.itinerary_id = $1
           ORDER BY (activities.start_at IS NOT NULL),
                    activities.sidebar_position NULLS LAST,
                    activities.created_at,
                    activities.name`,
          [parent.id],
        );

        return result.rows.map((activity) => ({
          id: activity.id,
          name: activity.name,
          note: activity.note,
          categoryId: activity.category_id,
          stopId: activity.stop_id,
          googlePlaceId: activity.google_place_id,
          googlePlaceName: activity.google_place_name,
          googlePlaceAddress: activity.google_place_address,
          inSidebar: activity.in_sidebar,
          startDate: activity.start_date,
          startTime: activity.start_time,
          endTime: clockTime(activity.start_date, activity.end_date, activity.end_time),
          sectionId: activity.section_id,
          sectionDate: activity.section_date,
          position: activity.position === null ? null : Number(activity.position),
          sidebarPosition:
            activity.sidebar_position === null ? null : Number(activity.sidebar_position),
        }));
      },
    },
    Query: {
      itineraries: async (
        _parent,
        args: { status: ItineraryRow["status"] },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to view itineraries.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        await purgeExpiredTrash();

        const result = await pool.query<ItineraryRow>(
          `SELECT ${itineraryColumns}
           FROM itineraries
           WHERE owner_id = $1 AND status = $2
           ORDER BY updated_at DESC, created_at DESC`,
          [context.userId, args.status],
        );

        return result.rows.map(toItinerary);
      },
      itinerary: async (
        _parent,
        args: { id: string },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to view itineraries.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        await purgeExpiredTrash();

        const result = await pool.query<ItineraryRow>(
          `SELECT ${itineraryColumns}
           FROM itineraries
           WHERE id = $1 AND owner_id = $2`,
          [args.id, context.userId],
        );

        const itinerary = result.rows[0];

        if (!itinerary) {
          return null;
        }

        return toItinerary(itinerary);
      },
    },
    Mutation: {
      createItinerary: async (
        _parent,
        args: {
          name: string;
          dateStart: string;
          dateEnd: string;
        },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to create itineraries.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const name = args.name.trim();
        const dateStart = parseIsoDate(args.dateStart);
        const dateEnd = parseIsoDate(args.dateEnd);

        if (!name) {
          throw new GraphQLError("Itinerary name is required.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (!dateStart || !dateEnd) {
          throw new GraphQLError("A valid start and end date are required.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (dateStart > dateEnd) {
          throw new GraphQLError("Start date must be on or before the end date.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const client = await pool.connect();

        try {
          await client.query("BEGIN");
          const result = await client.query<ItineraryRow>(
            `INSERT INTO itineraries (
               owner_id,
               name,
               date_start,
               date_end,
               day_start,
               day_end,
               time_interval,
               time_format,
               timezone
             )
             VALUES (
               $1, $2, $3::date, $4::date,
               TIME '09:00', TIME '21:00', 30, '12h', 'UTC'
             )
             RETURNING ${itineraryColumns}`,
            [context.userId, name, dateStart, dateEnd],
          );
          const itinerary = result.rows[0];

          await client.query(
            `INSERT INTO categories (itinerary_id, name, color, logistics, created_at)
             VALUES ($1, 'Transportation', '#DDEDE7', true, clock_timestamp())`,
            [itinerary.id],
          );
          await client.query(
            `INSERT INTO categories (itinerary_id, name, color, logistics, created_at)
             VALUES ($1, 'Accommodations', '#E8DFF0', true, clock_timestamp())`,
            [itinerary.id],
          );
          await client.query("COMMIT");

          return toItinerary(itinerary);
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      updateItineraryStatus: async (
        _parent,
        args: { id: string; status: ItineraryRow["status"] },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to update itineraries.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const result = await pool.query<ItineraryRow>(
          `UPDATE itineraries
           SET status = $1::varchar,
               updated_at = CURRENT_TIMESTAMP,
               trashed_at = CASE
                 WHEN $1::varchar <> 'trashed' THEN NULL
                 WHEN status = 'trashed' THEN COALESCE(trashed_at, CURRENT_TIMESTAMP)
                 ELSE CURRENT_TIMESTAMP
               END
           WHERE id = $2 AND owner_id = $3
           RETURNING ${itineraryColumns}`,
          [args.status, args.id, context.userId],
        );

        const itinerary = result.rows[0];

        if (!itinerary) {
          throw new GraphQLError("Itinerary not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        return toItinerary(itinerary);
      },
      renameItinerary: async (
        _parent,
        args: { id: string; name: string },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to update itineraries.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const name = args.name.trim();

        if (!name) {
          throw new GraphQLError("Itinerary name is required.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const result = await pool.query<ItineraryRow>(
          `UPDATE itineraries
           SET name = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND owner_id = $3
           RETURNING ${itineraryColumns}`,
          [name, args.id, context.userId],
        );

        const itinerary = result.rows[0];

        if (!itinerary) {
          throw new GraphQLError("Itinerary not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        return toItinerary(itinerary);
      },
      saveItinerarySchedule: async (
        _parent,
        args: {
          id: string;
          planningMode: "timeline" | "sections";
          dayStart?: string | null;
          dayEnd?: string | null;
          timeInterval?: number | null;
          places: string[];
          sections?: string[] | null;
        },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to update itineraries.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const planningMode = args.planningMode;
        const places = placeNames(args.places);
        let dayStart: string | null = null;
        let dayEnd: string | null = null;
        let timeInterval: number | null = null;
        let sections: string[] = [];

        if (places.length === 0) {
          throw new GraphQLError("A place is required.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (planningMode === "timeline") {
          dayStart = args.dayStart ? parseTime(args.dayStart) : null;
          dayEnd = args.dayEnd ? parseTime(args.dayEnd) : null;
          timeInterval = args.timeInterval ?? null;

          if (!dayStart || !dayEnd) {
            throw new GraphQLError("A valid day start and day end are required.", {
              extensions: { code: "BAD_USER_INPUT" },
            });
          }

          if (dayStart >= dayEnd) {
            throw new GraphQLError("Day end must be later than the day start.", {
              extensions: { code: "BAD_USER_INPUT" },
            });
          }

          if (timeInterval !== 30 && timeInterval !== 60) {
            throw new GraphQLError("Time interval must be 30 minutes or 1 hour.", {
              extensions: { code: "BAD_USER_INPUT" },
            });
          }
        } else {
          try {
            sections = sectionNames(args.sections ?? []);
          } catch (error) {
            throw new GraphQLError(
              error instanceof Error ? error.message : "A section is required.",
              { extensions: { code: "BAD_USER_INPUT" } },
            );
          }
        }

        const client = await pool.connect();

        try {
          await client.query("BEGIN");
          const existing = await client.query<{ schedule_configured: boolean }>(
            `SELECT schedule_configured
             FROM itineraries
             WHERE id = $1 AND owner_id = $2
             FOR UPDATE`,
            [args.id, context.userId],
          );

          if (!existing.rows[0]) {
            throw new GraphQLError("Itinerary not found.", {
              extensions: { code: "NOT_FOUND" },
            });
          }

          if (existing.rows[0].schedule_configured) {
            throw new GraphQLError("Planning style cannot be changed.", {
              extensions: { code: "BAD_USER_INPUT" },
            });
          }

          const result = await client.query<ItineraryRow>(
            planningMode === "timeline"
              ? `UPDATE itineraries
                 SET day_start = $1::time,
                     day_end = $2::time,
                     time_interval = $3,
                     planning_mode = 'timeline',
                     schedule_configured = true,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $4 AND owner_id = $5
                 RETURNING ${itineraryColumns}`
              : `UPDATE itineraries
                 SET planning_mode = 'sections',
                     schedule_configured = true,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1 AND owner_id = $2
                 RETURNING ${itineraryColumns}`,
            planningMode === "timeline"
              ? [dayStart, dayEnd, timeInterval, args.id, context.userId]
              : [args.id, context.userId],
          );
          const itinerary = result.rows[0];

          if (!itinerary) {
            throw new GraphQLError("Itinerary not found.", {
              extensions: { code: "NOT_FOUND" },
            });
          }

          for (const name of places) {
            const stop = await client.query<{ id: string }>(
              `INSERT INTO stops (itinerary_id, name, position)
               SELECT $1, $2, COALESCE(MAX(position) + 1, 0)
               FROM stops
               WHERE itinerary_id = $1
               RETURNING id`,
              [args.id, name],
            );
            await client.query(
              `INSERT INTO categories (itinerary_id, name, color, logistics, stop_id, created_at)
               VALUES
                 ($1, 'Restaurants', '#FFE5F2', false, $2, clock_timestamp()),
                 ($1, 'Bars', '#F4D0E1', false, $2, clock_timestamp() + interval '1 millisecond'),
                 ($1, 'Coffee', '#E9E0D8', false, $2, clock_timestamp() + interval '2 milliseconds'),
                 ($1, 'Activities', '#D6E5F5', false, $2, clock_timestamp() + interval '3 milliseconds')`,
              [args.id, stop.rows[0].id],
            );
          }

          for (const [position, name] of sections.entries()) {
            await client.query(
              `INSERT INTO itinerary_sections (itinerary_id, name, position)
               VALUES ($1, $2, $3)`,
              [args.id, name, position],
            );
          }

          await client.query("COMMIT");
          return toItinerary(itinerary);
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      saveItineraryDayHeading: async (
        _parent,
        args: { id: string; date: string; heading: string },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to update itineraries.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const date = parseIsoDate(args.date);
        const heading = args.heading.trim();

        if (!date) {
          throw new GraphQLError("A valid date is required.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (heading.length > 255) {
          throw new GraphQLError("Header must be 255 characters or fewer.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const owned = await pool.query<{ date_start: string; date_end: string }>(
          `SELECT date_start::text AS date_start, date_end::text AS date_end
           FROM itineraries
           WHERE id = $1 AND owner_id = $2`,
          [args.id, context.userId],
        );

        const itinerary = owned.rows[0];

        if (!itinerary) {
          throw new GraphQLError("Itinerary not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        if (date < itinerary.date_start || date > itinerary.date_end) {
          throw new GraphQLError("Header date must be within the itinerary.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (!heading) {
          await pool.query(
            `DELETE FROM itinerary_day_settings
             WHERE itinerary_id = $1 AND date = $2::date`,
            [args.id, date],
          );

          return true;
        }

        await pool.query(
          `INSERT INTO itinerary_day_settings (itinerary_id, date, heading)
           VALUES ($1, $2::date, $3)
           ON CONFLICT (itinerary_id, date)
           DO UPDATE SET heading = EXCLUDED.heading`,
          [args.id, date, heading],
        );

        return true;
      },
      updateItinerary: async (
        _parent,
        args: {
          id: string;
          name: string;
          dateStart: string;
          dateEnd: string;
          dayStart: string;
          dayEnd: string;
          timeInterval: number;
        },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to update itineraries.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const name = args.name.trim();
        const dateStart = parseIsoDate(args.dateStart);
        const dateEnd = parseIsoDate(args.dateEnd);
        const dayStart = parseTime(args.dayStart);
        const dayEnd = parseTime(args.dayEnd);
        const timeInterval = args.timeInterval;

        if (!name) {
          throw new GraphQLError("Itinerary name is required.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (!dateStart || !dateEnd) {
          throw new GraphQLError("A valid start and end date are required.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (dateStart > dateEnd) {
          throw new GraphQLError("Start date must be on or before the end date.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (!dayStart || !dayEnd) {
          throw new GraphQLError("A valid day start and day end are required.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (dayStart >= dayEnd) {
          throw new GraphQLError("Day end must be later than the day start.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (timeInterval !== 30 && timeInterval !== 60) {
          throw new GraphQLError("Time interval must be 30 minutes or 1 hour.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const result = await pool.query<ItineraryRow>(
          `UPDATE itineraries
           SET name = $1,
               date_start = $2::date,
               date_end = $3::date,
               day_start = $4::time,
               day_end = $5::time,
               time_interval = $6,
               schedule_configured = true,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $7 AND owner_id = $8
           RETURNING ${itineraryColumns}`,
          [
            name,
            dateStart,
            dateEnd,
            dayStart,
            dayEnd,
            timeInterval,
            args.id,
            context.userId,
          ],
        );

        const itinerary = result.rows[0];

        if (!itinerary) {
          throw new GraphQLError("Itinerary not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        await pool.query(
          `DELETE FROM itinerary_day_settings
           WHERE itinerary_id = $1
             AND (date < $2::date OR date > $3::date)`,
          [args.id, dateStart, dateEnd],
        );

        return toItinerary(itinerary);
      },
      deleteItinerary: async (
        _parent,
        args: { id: string },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to delete itineraries.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const result = await pool.query(
          `DELETE FROM itineraries
           WHERE id = $1 AND owner_id = $2
           RETURNING id`,
          [args.id, context.userId],
        );

        if (!result.rows[0]) {
          throw new GraphQLError("Itinerary not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        return true;
      },
      createCategory: async (
        _parent,
        args: { itineraryId: string; name: string; color: string; stopId?: string | null },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to create categories.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const name = args.name.trim();
        const color = parseHexColor(args.color);

        if (!name) {
          throw new GraphQLError("Category name is required.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (name.length > 255) {
          throw new GraphQLError("Category name must be 255 characters or fewer.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (!color) {
          throw new GraphQLError("Color must be a 6-digit hex code.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const owned = await pool.query(
          `SELECT id
           FROM itineraries
           WHERE id = $1 AND owner_id = $2`,
          [args.itineraryId, context.userId],
        );

        if (!owned.rows[0]) {
          throw new GraphQLError("Itinerary not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        const stopId = args.stopId?.trim() || null;

        if (stopId) {
          const stop = await pool.query(
            `SELECT id
             FROM stops
             WHERE id = $1 AND itinerary_id = $2`,
            [stopId, args.itineraryId],
          );

          if (!stop.rows[0]) {
            throw new GraphQLError("Place not found.", {
              extensions: { code: "NOT_FOUND" },
            });
          }
        }

        const result = await pool.query<{
          id: string;
          name: string;
          color: string;
          logistics: boolean;
          stopId: string | null;
        }>(
          `INSERT INTO categories (itinerary_id, name, color, logistics, stop_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name, color, logistics, stop_id AS "stopId"`,
          [args.itineraryId, name, color, stopId === null, stopId],
        );

        return result.rows[0];
      },
      updateCategory: async (
        _parent,
        args: { id: string; name: string; color: string },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to edit categories.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const name = args.name.trim();
        const color = parseHexColor(args.color);

        if (!name) {
          throw new GraphQLError("Category name is required.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (name.length > 255) {
          throw new GraphQLError("Category name must be 255 characters or fewer.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (!color) {
          throw new GraphQLError("Color must be a 6-digit hex code.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const result = await pool.query<{
          id: string;
          name: string;
          color: string;
          logistics: boolean;
          stopId: string | null;
        }>(
          `UPDATE categories
           SET name = $1, color = $2
           WHERE id = $3
             AND itinerary_id IN (
               SELECT id FROM itineraries WHERE owner_id = $4
             )
           RETURNING id, name, color, logistics, stop_id AS "stopId"`,
          [name, color, args.id, context.userId],
        );

        const category = result.rows[0];

        if (!category) {
          throw new GraphQLError("Category not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        return category;
      },
      deleteCategory: async (
        _parent,
        args: { id: string },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to delete categories.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const result = await pool.query(
          `DELETE FROM categories
           WHERE id = $1
             AND itinerary_id IN (
               SELECT id FROM itineraries WHERE owner_id = $2
             )
           RETURNING id`,
          [args.id, context.userId],
        );

        if (!result.rows[0]) {
          throw new GraphQLError("Category not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        return true;
      },
      createStop: async (
        _parent,
        args: { itineraryId: string; name: string },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to create places.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const name = args.name.trim();

        if (!name) {
          throw new GraphQLError("Place name is required.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (name.length > 255) {
          throw new GraphQLError("Place name must be 255 characters or fewer.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const owned = await pool.query(
          `SELECT id
           FROM itineraries
           WHERE id = $1 AND owner_id = $2`,
          [args.itineraryId, context.userId],
        );

        if (!owned.rows[0]) {
          throw new GraphQLError("Itinerary not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        const client = await pool.connect();

        try {
          await client.query("BEGIN");
          const result = await client.query<{ id: string; name: string }>(
            `INSERT INTO stops (itinerary_id, name, position)
             SELECT $1, $2, COALESCE(MAX(position) + 1, 0)
             FROM stops
             WHERE itinerary_id = $1
             RETURNING id, name`,
            [args.itineraryId, name],
          );
          const stop = result.rows[0];

          await client.query(
            `INSERT INTO categories (itinerary_id, name, color, logistics, stop_id, created_at)
             VALUES
               ($1, 'Restaurants', '#FFE5F2', false, $2, clock_timestamp()),
               ($1, 'Bars', '#F4D0E1', false, $2, clock_timestamp() + interval '1 millisecond'),
               ($1, 'Coffee', '#E9E0D8', false, $2, clock_timestamp() + interval '2 milliseconds'),
               ($1, 'Activities', '#D6E5F5', false, $2, clock_timestamp() + interval '3 milliseconds')`,
            [args.itineraryId, stop.id],
          );
          await client.query("COMMIT");

          return stop;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      updateStop: async (
        _parent,
        args: { id: string; name: string },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to edit places.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const name = args.name.trim();

        if (!name) {
          throw new GraphQLError("Place name is required.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (name.length > 255) {
          throw new GraphQLError("Place name must be 255 characters or fewer.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const result = await pool.query<{ id: string; name: string }>(
          `UPDATE stops
           SET name = $1
           WHERE id = $2
             AND itinerary_id IN (
               SELECT id FROM itineraries WHERE owner_id = $3
             )
           RETURNING id, name`,
          [name, args.id, context.userId],
        );

        const stop = result.rows[0];

        if (!stop) {
          throw new GraphQLError("Place not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        return stop;
      },
      deleteStop: async (_parent, args: { id: string }, context: GraphQLContext) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to delete places.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const result = await pool.query(
          `DELETE FROM stops
           WHERE id = $1
             AND itinerary_id IN (
               SELECT id FROM itineraries WHERE owner_id = $2
             )
           RETURNING id`,
          [args.id, context.userId],
        );

        if (!result.rows[0]) {
          throw new GraphQLError("Place not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        return true;
      },
      createActivity: async (
        _parent,
        args: {
          itineraryId: string;
          name: string;
          note: string;
          categoryId?: string | null;
          stopId?: string | null;
          googlePlaceId?: string | null;
          sessionToken?: string | null;
          inSidebar?: boolean | null;
          date?: string | null;
          startTime?: string | null;
          endTime?: string | null;
          sectionId?: string | null;
        },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to create activities.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const name = args.name.trim();
        const note = args.note.trim();
        const inSidebar = args.inSidebar !== false;
        const categoryId = args.categoryId?.trim() || null;
        const stopId = args.stopId?.trim() || null;

        if (!name) {
          throw new GraphQLError("Activity name is required.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (name.length > 255) {
          throw new GraphQLError("Activity name must be 255 characters or fewer.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const owned = await pool.query<{
          date_start: string;
          date_end: string;
          day_start: string;
          day_end: string;
          time_interval: number;
          timezone: string;
          planning_mode: "timeline" | "sections";
        }>(
          `SELECT date_start::text AS date_start,
                  date_end::text AS date_end,
                  day_start::text AS day_start,
                  day_end::text AS day_end,
                  time_interval,
                  timezone,
                  planning_mode
           FROM itineraries
           WHERE id = $1 AND owner_id = $2`,
          [args.itineraryId, context.userId],
        );

        const itinerary = owned.rows[0];

        if (!itinerary) {
          throw new GraphQLError("Itinerary not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        const scheduleDate = args.date?.trim() ?? "";
        const sectionId = args.sectionId?.trim() || null;
        const scheduling = scheduleDate !== "" || Boolean(args.startTime) || Boolean(args.endTime);

        if (sectionId && itinerary.planning_mode !== "sections") {
          throw new GraphQLError("This itinerary is planned on a timeline.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (sectionId && (args.startTime || args.endTime)) {
          throw new GraphQLError("Choose a section on this itinerary.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (!sectionId && scheduling && itinerary.planning_mode === "sections") {
          throw new GraphQLError("This itinerary is planned in sections.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }
        let startTime: string | null = null;
        let endTime: string | null = null;

        let sectionDate: string | null = null;

        if (sectionId) {
          sectionDate = parseIsoDate(scheduleDate);
          const section = sectionDate
            ? await pool.query(
                `SELECT id
                 FROM itinerary_sections
                 WHERE id = $1 AND itinerary_id = $2`,
                [sectionId, args.itineraryId],
              )
            : null;

          if (
            !sectionDate ||
            !section?.rows[0] ||
            sectionDate < itinerary.date_start ||
            sectionDate > itinerary.date_end
          ) {
            throw new GraphQLError("Choose a section on this itinerary.", {
              extensions: { code: "BAD_USER_INPUT" },
            });
          }
        }

        if (scheduling && !sectionId) {
          const date = parseIsoDate(scheduleDate);
          startTime = args.startTime ? parseTime(args.startTime) : null;
          endTime = args.endTime ? parseTime(args.endTime) : null;
          const dayStart = parseTime(itinerary.day_start);
          const dayEnd = parseTime(itinerary.day_end);

          if (
            !date ||
            !startTime ||
            !endTime ||
            !dayStart ||
            !dayEnd ||
            !validScheduleRange(
              dayStart,
              dayEnd,
              Number(itinerary.time_interval),
              startTime,
              endTime,
            ) ||
            date < itinerary.date_start ||
            date > itinerary.date_end
          ) {
            throw new GraphQLError("Choose a time on this itinerary.", {
              extensions: { code: "BAD_USER_INPUT" },
            });
          }
        }

        if (categoryId) {
          await assertCategoryMatchesPlace(categoryId, args.itineraryId, stopId);
        }

        if (stopId) {
          const stop = await pool.query(
            `SELECT id
             FROM stops
             WHERE id = $1 AND itinerary_id = $2`,
            [stopId, args.itineraryId],
          );

          if (!stop.rows[0]) {
            throw new GraphQLError("Place not found.", {
              extensions: { code: "NOT_FOUND" },
            });
          }
        }

        const placeId = await savedGooglePlace(
          args.itineraryId,
          args.googlePlaceId,
          args.sessionToken,
        );

        if (sectionId && sectionDate) {
          const placed = await pool.query<{
            id: string;
            name: string;
            note: string | null;
            category_id: string | null;
            stop_id: string | null;
          }>(
            `INSERT INTO activities (
               itinerary_id, category_id, stop_id, place_id, name, note,
               section_id, section_date, position, in_sidebar
             )
             VALUES (
               $1,
               $2,
               $3,
               $4,
               $5,
               $6,
               $7,
               $8,
               (
                 SELECT COALESCE(MAX(position), -1) + 1
                 FROM activities
                 WHERE section_id = $7
                   AND section_date = $8
               ),
               false
             )
             RETURNING id, name, note, category_id, stop_id`,
            [
              args.itineraryId,
              categoryId,
              stopId,
              placeId,
              name,
              note || null,
              sectionId,
              sectionDate,
            ],
          );
          const activity = placed.rows[0];

          return {
            id: activity.id,
            name: activity.name,
            note: activity.note,
            categoryId: activity.category_id,
            stopId: activity.stop_id,
          };
        }

        const result = await pool.query<{
          id: string;
          name: string;
          note: string | null;
          category_id: string | null;
          stop_id: string | null;
        }>(
          scheduling
            ? `INSERT INTO activities (
                 itinerary_id, category_id, stop_id, place_id, name, note, start_at, end_at, in_sidebar,
                 sidebar_position
               )
               VALUES (
                 $1,
                 $2,
                 $3,
                 $4,
                 $5,
                 $6,
                 (($7::date + $8::time) AT TIME ZONE $10),
                 (($7::date + $9::time) AT TIME ZONE $10),
                 $11,
                 CASE WHEN $11 THEN (
                   SELECT COALESCE(MAX(sidebar_position), -1) + 1
                   FROM activities
                   WHERE itinerary_id = $1
                     AND category_id IS NOT DISTINCT FROM $2::uuid
                     AND in_sidebar = true
                     AND start_at IS NOT NULL
                 ) ELSE NULL END
               )
               RETURNING id, name, note, category_id, stop_id`
            : `INSERT INTO activities (
                 itinerary_id, category_id, stop_id, place_id, name, note, in_sidebar, sidebar_position
               )
               VALUES (
                 $1,
                 $2,
                 $3,
                 $4,
                 $5,
                 $6,
                 $7,
                 CASE WHEN $7 THEN (
                   SELECT COALESCE(MAX(sidebar_position), -1) + 1
                   FROM activities
                   WHERE itinerary_id = $1
                     AND category_id IS NOT DISTINCT FROM $2::uuid
                     AND in_sidebar = true
                     AND start_at IS NULL
                 ) ELSE NULL END
               )
               RETURNING id, name, note, category_id, stop_id`,
          scheduling
            ? [
                args.itineraryId,
                categoryId,
                stopId,
                placeId,
                name,
                note || null,
                scheduleDate,
                startTime,
                endTime,
                itinerary.timezone,
                inSidebar,
              ]
            : [args.itineraryId, categoryId, stopId, placeId, name, note || null, inSidebar],
        );

        const activity = result.rows[0];

        return {
          id: activity.id,
          name: activity.name,
          note: activity.note,
          categoryId: activity.category_id,
          stopId: activity.stop_id,
        };
      },
      updateActivity: async (
        _parent,
        args: {
          id: string;
          name: string;
          note: string;
          categoryId?: string | null;
          stopId?: string | null;
          googlePlaceId?: string | null;
          sessionToken?: string | null;
          inSidebar?: boolean | null;
        },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to edit activities.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const name = args.name.trim();
        const note = args.note.trim();
        const categoryId = args.categoryId?.trim() || null;
        const stopId = args.stopId?.trim() || null;

        if (!name) {
          throw new GraphQLError("Activity name is required.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        if (name.length > 255) {
          throw new GraphQLError("Activity name must be 255 characters or fewer.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const existing = await pool.query<{
          itinerary_id: string;
          category_id: string | null;
          in_sidebar: boolean;
        }>(
          `SELECT activities.itinerary_id, activities.category_id, activities.in_sidebar
           FROM activities
           JOIN itineraries ON itineraries.id = activities.itinerary_id
           WHERE activities.id = $1 AND itineraries.owner_id = $2`,
          [args.id, context.userId],
        );

        const activityRow = existing.rows[0];

        if (!activityRow) {
          throw new GraphQLError("Activity not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        if (categoryId) {
          await assertCategoryMatchesPlace(categoryId, activityRow.itinerary_id, stopId);
        }

        if (stopId) {
          const stop = await pool.query(
            `SELECT id
             FROM stops
             WHERE id = $1 AND itinerary_id = $2`,
            [stopId, activityRow.itinerary_id],
          );

          if (!stop.rows[0]) {
            throw new GraphQLError("Place not found.", {
              extensions: { code: "NOT_FOUND" },
            });
          }
        }

        const requestedPlaceId = args.googlePlaceId?.trim() ?? "";
        let placeId: string | null = null;

        if (requestedPlaceId && args.sessionToken?.trim()) {
          placeId = await savedGooglePlace(
            activityRow.itinerary_id,
            requestedPlaceId,
            args.sessionToken,
          );
        } else if (requestedPlaceId) {
          const existingPlace = await pool.query<{ id: string }>(
            `SELECT id
             FROM places
             WHERE itinerary_id = $1 AND google_place_id = $2`,
            [activityRow.itinerary_id, requestedPlaceId],
          );

          if (!existingPlace.rows[0]) {
            throw new GraphQLError("Choose a place from the suggestions.", {
              extensions: { code: "BAD_USER_INPUT" },
            });
          }

          placeId = existingPlace.rows[0].id;
        }

        const result = await pool.query<{
          id: string;
          name: string;
          note: string | null;
          category_id: string | null;
          stop_id: string | null;
        }>(
          `UPDATE activities
           SET name = $1,
               note = $2,
               category_id = $3,
               stop_id = $4,
               place_id = $5,
               in_sidebar = CASE WHEN $8::boolean IS NULL THEN in_sidebar ELSE $8 END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $6 AND itinerary_id = $7
           RETURNING id, name, note, category_id, stop_id`,
          [
            name,
            note || null,
            categoryId,
            stopId,
            placeId,
            args.id,
            activityRow.itinerary_id,
            typeof args.inSidebar === "boolean" ? args.inSidebar : null,
          ],
        );

        const activity = result.rows[0];
        const joinsSidebar = typeof args.inSidebar === "boolean" ? args.inSidebar : activityRow.in_sidebar;

        if (joinsSidebar && (activity.category_id !== activityRow.category_id || !activityRow.in_sidebar)) {
          await pool.query(
            `UPDATE activities
             SET sidebar_position = (
               SELECT COALESCE(MAX(siblings.sidebar_position), -1) + 1
               FROM activities AS siblings
               WHERE siblings.itinerary_id = activities.itinerary_id
                 AND siblings.category_id IS NOT DISTINCT FROM $2::uuid
                 AND siblings.in_sidebar = true
                 AND siblings.id <> activities.id
                 AND (siblings.start_at IS NOT NULL) = (activities.start_at IS NOT NULL)
             )
             WHERE id = $1`,
            [args.id, activity.category_id],
          );
        }

        return {
          id: activity.id,
          name: activity.name,
          note: activity.note,
          categoryId: activity.category_id,
          stopId: activity.stop_id,
        };
      },
      scheduleActivity: async (
        _parent,
        args: { id: string; itineraryId: string; date: string; startTime: string; endTime: string },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to schedule activities.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const date = parseIsoDate(args.date);
        const startTime = parseTime(args.startTime);
        const parsedEnd = parseScheduleEnd(args.endTime);

        if (!date || !startTime || !parsedEnd) {
          throw new GraphQLError("Choose a time on this itinerary.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const existing = await pool.query<{
          date_start: string;
          date_end: string;
          day_start: string;
          day_end: string;
          time_interval: number;
          timezone: string;
          planning_mode: "timeline" | "sections";
          scheduled: boolean;
        }>(
          `SELECT itineraries.date_start::text AS date_start,
                  itineraries.date_end::text AS date_end,
                  itineraries.day_start::text AS day_start,
                  itineraries.day_end::text AS day_end,
                  itineraries.time_interval,
                  itineraries.timezone,
                  itineraries.planning_mode,
                  activities.start_at IS NOT NULL AS scheduled
           FROM activities
           JOIN itineraries ON itineraries.id = activities.itinerary_id
           WHERE activities.id = $1
             AND activities.itinerary_id = $2
             AND itineraries.owner_id = $3`,
          [args.id, args.itineraryId, context.userId],
        );

        const itinerary = existing.rows[0];

        if (!itinerary) {
          throw new GraphQLError("Activity not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        if (itinerary.planning_mode === "sections") {
          throw new GraphQLError("This itinerary is planned in sections.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const dayStart = parseTime(itinerary.day_start);
        const dayEnd = parseTime(itinerary.day_end);

        const endDate = addUtcDays(date, parsedEnd.extraDays);

        if (
          !dayStart ||
          !dayEnd ||
          !validScheduleRange(
            dayStart,
            dayEnd,
            Number(itinerary.time_interval),
            startTime,
            parsedEnd.time,
          ) ||
          date < itinerary.date_start ||
          endDate > itinerary.date_end
        ) {
          throw new GraphQLError("Choose a time on this itinerary.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        await pool.query(
          `UPDATE activities
           SET start_at = (($3::date + $4::time) AT TIME ZONE $6),
               end_at = ((($3::date + $7::int) + $5::time) AT TIME ZONE $6),
               sidebar_position = CASE
                 WHEN $8::boolean OR in_sidebar = false THEN sidebar_position
                 ELSE (
                   SELECT COALESCE(MAX(siblings.sidebar_position), -1) + 1
                   FROM activities AS siblings
                   WHERE siblings.itinerary_id = activities.itinerary_id
                     AND siblings.category_id IS NOT DISTINCT FROM activities.category_id
                     AND siblings.in_sidebar = true
                     AND siblings.id <> activities.id
                     AND siblings.start_at IS NOT NULL
                 )
               END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND itinerary_id = $2`,
          [
            args.id,
            args.itineraryId,
            date,
            startTime,
            parsedEnd.time,
            itinerary.timezone,
            parsedEnd.extraDays,
            itinerary.scheduled,
          ],
        );

        return true;
      },
      unscheduleActivity: async (
        _parent,
        args: { id: string; itineraryId: string },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to edit activities.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const existing = await pool.query<{
          planning_mode: "timeline" | "sections";
          section_id: string | null;
          section_date: string | null;
        }>(
          `SELECT itineraries.planning_mode,
                  activities.section_id,
                  activities.section_date::text AS section_date
           FROM activities
           JOIN itineraries ON itineraries.id = activities.itinerary_id
           WHERE activities.id = $1
             AND activities.itinerary_id = $2
             AND itineraries.owner_id = $3`,
          [args.id, args.itineraryId, context.userId],
        );
        const current = existing.rows[0];

        if (!current) {
          throw new GraphQLError("Activity not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        if (current.planning_mode === "sections") {
          const client = await pool.connect();

          try {
            await client.query("BEGIN");
            await client.query(
              `UPDATE activities
               SET section_id = NULL,
                   section_date = NULL,
                   position = NULL,
                   start_at = NULL,
                   end_at = NULL,
                   in_sidebar = true,
                   sidebar_position = (
                     SELECT COALESCE(MAX(siblings.sidebar_position), -1) + 1
                     FROM activities AS siblings
                     WHERE siblings.itinerary_id = activities.itinerary_id
                       AND siblings.category_id IS NOT DISTINCT FROM activities.category_id
                       AND siblings.in_sidebar = true
                       AND siblings.id <> activities.id
                       AND siblings.start_at IS NULL
                       AND siblings.section_id IS NULL
                   ),
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1
                 AND itinerary_id = $2`,
              [args.id, args.itineraryId],
            );

            if (current.section_id && current.section_date) {
              await compactSectionPositions(client, current.section_id, current.section_date);
            }

            await client.query("COMMIT");
            return true;
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          } finally {
            client.release();
          }
        }

        const result = await pool.query(
          `UPDATE activities
           SET start_at = NULL,
               end_at = NULL,
               sidebar_position = CASE
                 WHEN in_sidebar = false THEN sidebar_position
                 ELSE (
                   SELECT COALESCE(MAX(siblings.sidebar_position), -1) + 1
                   FROM activities AS siblings
                   WHERE siblings.itinerary_id = activities.itinerary_id
                     AND siblings.category_id IS NOT DISTINCT FROM activities.category_id
                     AND siblings.in_sidebar = true
                     AND siblings.id <> activities.id
                     AND siblings.start_at IS NULL
                 )
               END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
             AND itinerary_id = $2
             AND itinerary_id IN (
               SELECT id FROM itineraries WHERE owner_id = $3
             )
           RETURNING id`,
          [args.id, args.itineraryId, context.userId],
        );

        if (!result.rows[0]) {
          throw new GraphQLError("Activity not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        return true;
      },
      placeActivityInSection: async (
        _parent,
        args: {
          id: string;
          itineraryId: string;
          date: string;
          sectionId: string;
          position: number;
        },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to edit activities.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const date = parseIsoDate(args.date);
        const sectionId = args.sectionId.trim();

        if (!date || !sectionId || !Number.isInteger(args.position) || args.position < 0) {
          throw new GraphQLError("Choose a section on this itinerary.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const client = await pool.connect();

        try {
          await client.query("BEGIN");
          const itineraryResult = await client.query<{
            planning_mode: "timeline" | "sections";
            date_start: string;
            date_end: string;
          }>(
            `SELECT planning_mode, date_start::text AS date_start, date_end::text AS date_end
             FROM itineraries
             WHERE id = $1 AND owner_id = $2
             FOR UPDATE`,
            [args.itineraryId, context.userId],
          );
          const itinerary = itineraryResult.rows[0];

          if (!itinerary) {
            throw new GraphQLError("Itinerary not found.", {
              extensions: { code: "NOT_FOUND" },
            });
          }

          if (itinerary.planning_mode !== "sections") {
            throw new GraphQLError("This itinerary is planned on a timeline.", {
              extensions: { code: "BAD_USER_INPUT" },
            });
          }

          if (date < itinerary.date_start || date > itinerary.date_end) {
            throw new GraphQLError("Choose a section on this itinerary.", {
              extensions: { code: "BAD_USER_INPUT" },
            });
          }

          const section = await client.query(
            `SELECT id
             FROM itinerary_sections
             WHERE id = $1 AND itinerary_id = $2`,
            [sectionId, args.itineraryId],
          );

          if (!section.rows[0]) {
            throw new GraphQLError("Section not found.", {
              extensions: { code: "NOT_FOUND" },
            });
          }

          const activityResult = await client.query<{
            section_id: string | null;
            section_date: string | null;
            in_sidebar: boolean;
          }>(
            `SELECT section_id, section_date::text AS section_date, in_sidebar
             FROM activities
             WHERE id = $1 AND itinerary_id = $2
             FOR UPDATE`,
            [args.id, args.itineraryId],
          );
          const activity = activityResult.rows[0];

          if (!activity) {
            throw new GraphQLError("Activity not found.", {
              extensions: { code: "NOT_FOUND" },
            });
          }

          const cell = await client.query<{ id: string }>(
            `SELECT id
             FROM activities
             WHERE section_id = $1 AND section_date = $2
             ORDER BY position, id`,
            [sectionId, date],
          );
          const currentIds = cell.rows.map((row) => row.id);
          const without = currentIds.filter((id) => id !== args.id);
          const index = Math.min(args.position, without.length);
          const nextIds = [...without.slice(0, index), args.id, ...without.slice(index)];
          const unchanged =
            !activity.in_sidebar &&
            activity.section_id === sectionId &&
            activity.section_date === date &&
            currentIds.length === nextIds.length &&
            currentIds.every((id, itemIndex) => id === nextIds[itemIndex]);

          if (unchanged) {
            await client.query("COMMIT");
            return true;
          }

          await client.query(
            `UPDATE activities
             SET section_id = NULL,
                 section_date = NULL,
                 position = NULL
             WHERE id = $1`,
            [args.id],
          );

          if (
            activity.section_id &&
            activity.section_date &&
            (activity.section_id !== sectionId || activity.section_date !== date)
          ) {
            await compactSectionPositions(client, activity.section_id, activity.section_date);
          }

          if (activity.section_id === sectionId && activity.section_date === date) {
            await compactSectionPositions(client, sectionId, date);
          }

          await client.query(
            `UPDATE activities
             SET position = position + 1
             WHERE section_id = $1
               AND section_date = $2
               AND position >= $3`,
            [sectionId, date, index],
          );
          await client.query(
            `UPDATE activities
             SET section_id = $2,
                 section_date = $3,
                 position = $4,
                 start_at = NULL,
                 end_at = NULL,
                 in_sidebar = false,
                 sidebar_position = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [args.id, sectionId, date, index],
          );
          await client.query("COMMIT");
          return true;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      reorderSidebarActivity: async (
        _parent,
        args: { id: string; itineraryId: string; beforeId?: string | null },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to edit activities.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const beforeId = args.beforeId?.trim() || null;

        if (beforeId === args.id) {
          return true;
        }

        const client = await pool.connect();

        try {
          await client.query("BEGIN");
          const currentResult = await client.query<{
            category_id: string | null;
            in_sidebar: boolean;
            scheduled: boolean;
          }>(
            `SELECT category_id, in_sidebar, start_at IS NOT NULL AS scheduled
             FROM activities
             WHERE id = $1
               AND itinerary_id = $2
               AND itinerary_id IN (SELECT id FROM itineraries WHERE owner_id = $3)
             FOR UPDATE`,
            [args.id, args.itineraryId, context.userId],
          );
          const current = currentResult.rows[0];

          if (!current) {
            throw new GraphQLError("Activity not found.", {
              extensions: { code: "NOT_FOUND" },
            });
          }

          if (!current.in_sidebar) {
            throw new GraphQLError("Only sidebar activities can be reordered.", {
              extensions: { code: "BAD_USER_INPUT" },
            });
          }

          const siblings = await client.query<{ id: string; scheduled: boolean }>(
            `SELECT id, start_at IS NOT NULL AS scheduled
             FROM activities
             WHERE itinerary_id = $1
               AND category_id IS NOT DISTINCT FROM $2::uuid
               AND in_sidebar = true
             ORDER BY (start_at IS NOT NULL), sidebar_position NULLS LAST, created_at, id
             FOR UPDATE`,
            [args.itineraryId, current.category_id],
          );
          const ordered = siblings.rows.map((activity) => ({
            id: activity.id,
            scheduled: activity.scheduled,
          }));
          let next = ordered;

          if (beforeId) {
            const before = ordered.find((activity) => activity.id === beforeId);

            if (!before || before.scheduled !== current.scheduled) {
              throw new GraphQLError("Drop the activity within its own group.", {
                extensions: { code: "BAD_USER_INPUT" },
              });
            }

            const moved = reorderSidebarActivities(ordered, args.id, beforeId, "before");

            if (!moved) {
              await client.query("COMMIT");
              return true;
            }

            next = moved;
          } else {
            const without = ordered.filter((activity) => activity.id !== args.id);
            let lastGroupIndex = -1;

            for (let index = 0; index < without.length; index += 1) {
              if (without[index].scheduled === current.scheduled) {
                lastGroupIndex = index;
              }
            }

            const moved = [...without];
            moved.splice(lastGroupIndex + 1, 0, { id: args.id, scheduled: current.scheduled });

            if (moved.every((activity, index) => activity.id === ordered[index]?.id)) {
              await client.query("COMMIT");
              return true;
            }

            next = moved;
          }

          for (const [position, activity] of next.entries()) {
            await client.query(
              `UPDATE activities
               SET sidebar_position = $1
               WHERE id = $2 AND itinerary_id = $3`,
              [position, activity.id, args.itineraryId],
            );
          }

          await client.query("COMMIT");
          return true;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      deleteActivity: async (
        _parent,
        args: { id: string },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to delete activities.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const result = await pool.query(
          `DELETE FROM activities
           WHERE id = $1
             AND itinerary_id IN (
               SELECT id FROM itineraries WHERE owner_id = $2
             )
           RETURNING id`,
          [args.id, context.userId],
        );

        if (!result.rows[0]) {
          throw new GraphQLError("Activity not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        return true;
      },
    },
  },
});
