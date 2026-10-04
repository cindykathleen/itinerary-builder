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
const DEFAULT_CATEGORY_COLOR = "#E0E6ED"; // --surface

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
      categories: [Category!]!
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
    }

    type Activity {
      id: ID!
      name: String!
      note: String
      categoryId: ID
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
      createCategory(itineraryId: ID!, name: String!, color: String!): Category!
      updateCategory(id: ID!, name: String!, color: String!): Category!
      deleteCategory(id: ID!): Boolean!
      createActivity(
        itineraryId: ID!
        name: String!
        note: String!
        categoryId: ID
      ): Activity!
      updateActivity(id: ID!, name: String!, note: String!, categoryId: ID): Activity!
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
        const result = await pool.query<{ id: string; name: string; color: string }>(
          `SELECT id, name, color
           FROM categories
           WHERE itinerary_id = $1
           ORDER BY created_at, name`,
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
        }>(
          `SELECT id, name, note, category_id
           FROM activities
           WHERE itinerary_id = $1
           ORDER BY created_at, name`,
          [parent.id],
        );

        return result.rows.map((activity) => ({
          id: activity.id,
          name: activity.name,
          note: activity.note,
          categoryId: activity.category_id,
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
      createCategory: async (
        _parent,
        args: { itineraryId: string; name: string; color: string },
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

        const result = await pool.query<{ id: string; name: string; color: string }>(
          `INSERT INTO categories (itinerary_id, name, color)
           VALUES ($1, $2, $3)
           RETURNING id, name, color`,
          [args.itineraryId, name, color],
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

        const result = await pool.query<{ id: string; name: string; color: string }>(
          `UPDATE categories
           SET name = $1, color = $2
           WHERE id = $3
             AND itinerary_id IN (
               SELECT id FROM itineraries WHERE owner_id = $4
             )
           RETURNING id, name, color`,
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
      createActivity: async (
        _parent,
        args: { itineraryId: string; name: string; note: string; categoryId?: string | null },
        context: GraphQLContext,
      ) => {
        if (!context.userId) {
          throw new GraphQLError("You must be signed in to create activities.", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        const name = args.name.trim();
        const note = args.note.trim();
        const categoryId = args.categoryId?.trim() || null;

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

        if (categoryId) {
          const category = await pool.query(
            `SELECT id
             FROM categories
             WHERE id = $1 AND itinerary_id = $2`,
            [categoryId, args.itineraryId],
          );

          if (!category.rows[0]) {
            throw new GraphQLError("Category not found.", {
              extensions: { code: "NOT_FOUND" },
            });
          }
        }

        const result = await pool.query<{
          id: string;
          name: string;
          note: string | null;
          category_id: string | null;
        }>(
          `INSERT INTO activities (itinerary_id, category_id, name, note)
           VALUES ($1, $2, $3, $4)
           RETURNING id, name, note, category_id`,
          [args.itineraryId, categoryId, name, note || null],
        );

        const activity = result.rows[0];

        return {
          id: activity.id,
          name: activity.name,
          note: activity.note,
          categoryId: activity.category_id,
        };
      },
      updateActivity: async (
        _parent,
        args: { id: string; name: string; note: string; categoryId?: string | null },
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
          const category = await pool.query(
            `SELECT id
             FROM categories
             WHERE id = $1 AND itinerary_id = $2`,
            [categoryId, activityRow.itinerary_id],
          );

          if (!category.rows[0]) {
            throw new GraphQLError("Category not found.", {
              extensions: { code: "NOT_FOUND" },
            });
          }
        }

        const result = await pool.query<{
          id: string;
          name: string;
          note: string | null;
          category_id: string | null;
        }>(
          `UPDATE activities
           SET name = $1,
               note = $2,
               category_id = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4 AND itinerary_id = $5
           RETURNING id, name, note, category_id`,
          [name, note || null, categoryId, args.id, activityRow.itinerary_id],
        );

        const activity = result.rows[0];

        return {
          id: activity.id,
          name: activity.name,
          note: activity.note,
          categoryId: activity.category_id,
        };
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
