import { GraphQLError } from "graphql";
import { createSchema } from "graphql-yoga";
import pool from "@/lib/db";
import type { GraphQLContext } from "./context";

type ItineraryRow = {
  id: string;
  name: string;
  destination: string;
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

function toItinerary(row: ItineraryRow) {
  return {
    id: row.id,
    name: row.name,
    destination: row.destination,
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
  destination,
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

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

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
      destination: String!
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
    }

    type ItineraryDay {
      date: String!
      heading: String
    }

    type Query {
      itineraries(status: ItineraryStatus!): [Itinerary!]!
      itinerary(id: ID!): Itinerary
    }

    type Mutation {
      createItinerary(
        name: String!
        destination: String!
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
      ): Itinerary!
      saveItineraryDayHeading(id: ID!, date: String!, heading: String!): Boolean!
      updateItinerary(
        id: ID!
        name: String!
        destination: String!
        dateStart: String!
        dateEnd: String!
        dayStart: String!
        dayEnd: String!
        timeInterval: Int!
      ): Itinerary!
      deleteItinerary(id: ID!): Boolean!
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
          destination: string;
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
        const destination = args.destination.trim();
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

        const result = await pool.query<ItineraryRow>(
          `INSERT INTO itineraries (
             owner_id,
             name,
             destination,
             date_start,
             date_end,
             day_start,
             day_end,
             time_interval,
             time_format,
             timezone
           )
           VALUES (
             $1, $2, $3, $4::date, $5::date,
             TIME '09:00', TIME '21:00', 30, '12h', 'UTC'
           )
           RETURNING ${itineraryColumns}`,
          [context.userId, name, destination, dateStart, dateEnd],
        );

        return toItinerary(result.rows[0]);
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
           SET status = $1, updated_at = CURRENT_TIMESTAMP
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

        return toItinerary(itinerary);
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
          destination: string;
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
        const destination = args.destination.trim();
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
               destination = $2,
               date_start = $3::date,
               date_end = $4::date,
               day_start = $5::time,
               day_end = $6::time,
               time_interval = $7,
               schedule_configured = true,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $8 AND owner_id = $9
           RETURNING ${itineraryColumns}`,
          [
            name,
            destination,
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
    },
  },
});
