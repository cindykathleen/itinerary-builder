import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { autocompletePlaces, GooglePlacesError } from "@/lib/google-places";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return Response.json({ error: "You must be signed in." }, { status: 401 });
  }

  const input = request.nextUrl.searchParams.get("input") ?? "";
  const sessionToken = request.nextUrl.searchParams.get("sessionToken");

  try {
    const suggestions = await autocompletePlaces(input, sessionToken);
    return Response.json({ suggestions });
  } catch (error) {
    const message = error instanceof GooglePlacesError ? error.message : "Place search failed.";
    const status = message === "Google Places is not configured." ? 503 : 502;
    return Response.json({ error: message }, { status });
  }
}
