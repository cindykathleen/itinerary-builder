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
  status: "active" | "archived" | "trashed";
  photo_url: string | null;
};

function toItinerary(row: ItineraryRow) {
  return {
    id: row.id,
    name: row.name,
    destination: row.destination,
    dateStart: row.date_start,
    dateEnd: row.date_end,
    status: row.status,
    photoUrl: row.photo_url,
  };
}

const itineraryColumns = `
  id,
  name,
  destination,
  date_start::text AS date_start,
  date_end::text AS date_end,
  status,
  photo_url
`;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
      status: ItineraryStatus!
      photoUrl: String
    }

    type Query {
      itineraries(status: ItineraryStatus!): [Itinerary!]!
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
      deleteItinerary(id: ID!): Boolean!
    }
  `,
  resolvers: {
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
           ORDER BY date_start DESC, created_at DESC`,
          [context.userId, args.status],
        );

        return result.rows.map(toItinerary);
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

        if (!destination) {
          throw new GraphQLError("Itinerary destination is required.", {
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
