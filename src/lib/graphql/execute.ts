import { graphql } from "graphql";
import { headers } from "next/headers";
import { createContext } from "./context";
import { schema } from "./schema";

export async function executeGraphQL<TData>(
  source: string,
  variables?: Record<string, unknown>,
): Promise<TData> {
  const result = await graphql({
    schema,
    source,
    variableValues: variables,
    contextValue: await createContext(await headers()),
  });

  if (result.errors?.length) {
    throw new Error(result.errors[0].message);
  }

  if (!result.data) {
    throw new Error("GraphQL query returned no data.");
  }

  return result.data as TData;
}
