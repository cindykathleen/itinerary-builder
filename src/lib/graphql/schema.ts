import { GraphQLError } from "graphql";
import { createSchema } from "graphql-yoga";
import pool from "@/lib/db";
import { getGooglePlace, GooglePlacesError, type GooglePlace } from "@/lib/google-places";
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
};

function clockTime(startDate: string | null, endDate: string | null, endTime: string | null) {
  if (!startDate || !endDate || !endTime || endDate <= startDate) {
    return endTime;
  }

  const [hours, minutes] = endTime.split(":").map(Number);
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const total = days * 24 * 60 + hours * 60 + minutes;

  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

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
  schedule_configured
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
      daySettings: [ItineraryDay!]!
      categories: [Category!]!
      stops: [Stop!]!
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

    type ItineraryPlace {
      id: ID!
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
        dayStart: String!
        dayEnd: String!
        timeInterval: Int!
        places: [String!]!
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
      googlePlaces: async (parent: { id: string }) => {
        const result = await pool.query<{
          id: string;
          name: string;
          address: string;
          latitude: number;
          longitude: number;
          color: string;
        }>(
          `SELECT id, name, address, latitude, longitude, color
           FROM (
             SELECT DISTINCT ON (places.id)
                    places.id,
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

        return result.rows;
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
                  to_char(activities.end_at AT TIME ZONE itineraries.timezone, 'HH24:MI') AS end_time
           FROM activities
           JOIN itineraries ON itineraries.id = activities.itinerary_id
           LEFT JOIN places ON places.id = activities.place_id
           WHERE activities.itinerary_id = $1
           ORDER BY activities.created_at, activities.name`,
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
          dayStart: string;
          dayEnd: string;
          timeInterval: number;
          places: string[];
        },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to update itineraries.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const dayStart = parseTime(args.dayStart);
        const dayEnd = parseTime(args.dayEnd);
        const timeInterval = args.timeInterval;
        const places = placeNames(args.places);

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

        if (places.length === 0) {
          throw new GraphQLError("A place is required.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const client = await pool.connect();

        try {
          await client.query("BEGIN");
          const result = await client.query<ItineraryRow>(
            `UPDATE itineraries
             SET day_start = $1::time,
                 day_end = $2::time,
                 time_interval = $3,
                 schedule_configured = true,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4 AND owner_id = $5
             RETURNING ${itineraryColumns}`,
            [dayStart, dayEnd, timeInterval, args.id, context.userId],
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
        }>(
          `SELECT date_start::text AS date_start,
                  date_end::text AS date_end,
                  day_start::text AS day_start,
                  day_end::text AS day_end,
                  time_interval,
                  timezone
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
        const scheduling = scheduleDate !== "" || Boolean(args.startTime) || Boolean(args.endTime);
        let startTime: string | null = null;
        let endTime: string | null = null;

        if (scheduling) {
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

        const result = await pool.query<{
          id: string;
          name: string;
          note: string | null;
          category_id: string | null;
          stop_id: string | null;
        }>(
          scheduling
            ? `INSERT INTO activities (
                 itinerary_id, category_id, stop_id, place_id, name, note, start_at, end_at, in_sidebar
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
                 $11
               )
               RETURNING id, name, note, category_id, stop_id`
            : `INSERT INTO activities (
                 itinerary_id, category_id, stop_id, place_id, name, note, in_sidebar
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7)
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

        const existing = await pool.query<{ itinerary_id: string }>(
          `SELECT activities.itinerary_id
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
        }>(
          `SELECT itineraries.date_start::text AS date_start,
                  itineraries.date_end::text AS date_end,
                  itineraries.day_start::text AS day_start,
                  itineraries.day_end::text AS day_end,
                  itineraries.time_interval,
                  itineraries.timezone
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

        const result = await pool.query(
          `UPDATE activities
           SET start_at = NULL,
               end_at = NULL,
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
