import { createYoga } from "graphql-yoga";
import { createContext, schema } from "./schema";

export const yoga = createYoga({
  schema,
  context: ({ request }) => createContext(request.headers),
  graphqlEndpoint: "/api/graphql",
  fetchAPI: { Response },
});
