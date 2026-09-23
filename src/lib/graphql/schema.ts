import { GraphQLError } from "graphql";
import { createSchema } from "graphql-yoga";
import { auth } from "@/lib/auth";
import pool from "@/lib/db";

export type GraphQLContext = {
  userId: string | null;
};

type ItineraryRow = {
  id: string;
  name: string;
  destination: string;
  date_start: string;
  date_end: string;
  status: "active" | "archived" | "trashed";
};

export async function createContext(requestHeaders: Headers): Promise<GraphQLContext> {
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

  return {
    userId: session?.user.id ?? null,
  };
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
    }

    type Query {
      itineraries(status: ItineraryStatus!): [Itinerary!]!
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
          `SELECT
             id,
             name,
             destination,
             date_start::text AS date_start,
             date_end::text AS date_end,
             status
           FROM itineraries
           WHERE owner_id = $1 AND status = $2
           ORDER BY date_start DESC, created_at DESC`,
          [context.userId, args.status],
        );

        return result.rows.map((row) => ({
          id: row.id,
          name: row.name,
          destination: row.destination,
          dateStart: row.date_start,
          dateEnd: row.date_end,
          status: row.status,
        }));
      },
    },
  },
});
