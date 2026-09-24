import { auth } from "@/lib/auth";

export type GraphQLContext = {
  userId: string | null;
};

export async function createContext(requestHeaders: Headers): Promise<GraphQLContext> {
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

  return {
    userId: session?.user.id ?? null,
  };
}
