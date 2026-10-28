const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places";
const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{8,255}$/;
const SESSION_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class GooglePlacesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GooglePlacesError";
  }
}

export type PlaceSuggestion = {
  placeId: string;
  name: string;
  address: string;
};

export type GooglePlace = {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

function apiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY;

  if (!key) {
    throw new GooglePlacesError("Google Places is not configured.");
  }

  return key;
}

function sessionToken(value: string | null | undefined) {
  const token = value?.trim() ?? "";
  return SESSION_TOKEN_PATTERN.test(token) ? token : null;
}

function clip(value: string) {
  return value.trim().slice(0, 255);
}

async function placesRequest(url: string | URL, init: RequestInit) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-Goog-Api-Key", apiKey());

  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new GooglePlacesError("Place search failed.");
  }

  if (!response.ok) {
    throw new GooglePlacesError(
      response.status === 404 ? "That place could not be found." : "Place search failed.",
    );
  }

  return response.json() as Promise<unknown>;
}

export async function autocompletePlaces(input: string, token: string | null) {
  const query = input.trim().slice(0, 100);

  if (query.length < 2) {
    return [];
  }

  const body: { input: string; sessionToken?: string } = { input: query };
  const validToken = sessionToken(token);

  if (validToken) {
    body.sessionToken = validToken;
  }

  const payload = await placesRequest(`${PLACES_ENDPOINT}:autocomplete`, {
    method: "POST",
    headers: {
      "X-Goog-FieldMask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.text",
    },
    body: JSON.stringify(body),
  });

  const suggestions = (payload as { suggestions?: unknown }).suggestions;

  if (!Array.isArray(suggestions)) {
    return [];
  }

  return suggestions.flatMap((suggestion) => {
    const prediction = (suggestion as { placePrediction?: unknown }).placePrediction as
      | {
          placeId?: unknown;
          text?: { text?: unknown };
          structuredFormat?: {
            mainText?: { text?: unknown };
            secondaryText?: { text?: unknown };
          };
        }
      | undefined;
    const placeId = prediction?.placeId;
    const name = prediction?.structuredFormat?.mainText?.text ?? prediction?.text?.text;
    const address = prediction?.structuredFormat?.secondaryText?.text;

    if (typeof placeId !== "string" || !PLACE_ID_PATTERN.test(placeId) || typeof name !== "string") {
      return [];
    }

    return [
      {
        placeId,
        name: name.trim(),
        address: typeof address === "string" ? address.trim() : "",
      },
    ];
  });
}

export async function getGooglePlace(placeId: string, token: string | null) {
  if (!PLACE_ID_PATTERN.test(placeId)) {
    throw new GooglePlacesError("Choose a place from the suggestions.");
  }

  const validToken = sessionToken(token);
  const url = new URL(`${PLACES_ENDPOINT}/${encodeURIComponent(placeId)}`);

  if (validToken) {
    url.searchParams.set("sessionToken", validToken);
  }

  const payload = (await placesRequest(url, {
    method: "GET",
    headers: {
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
    },
  })) as {
    id?: unknown;
    displayName?: { text?: unknown };
    formattedAddress?: unknown;
    location?: { latitude?: unknown; longitude?: unknown };
  };

  const id = typeof payload.id === "string" ? payload.id : placeId;
  const name = payload.displayName?.text;
  const latitude = payload.location?.latitude;
  const longitude = payload.location?.longitude;

  if (
    !PLACE_ID_PATTERN.test(id) ||
    typeof name !== "string" ||
    name.trim() === "" ||
    typeof latitude !== "number" ||
    typeof longitude !== "number"
  ) {
    throw new GooglePlacesError("That place could not be found.");
  }

  const address =
    typeof payload.formattedAddress === "string" && payload.formattedAddress.trim() !== ""
      ? payload.formattedAddress
      : name;

  return {
    placeId: id,
    name: clip(name),
    address: clip(address),
    latitude,
    longitude,
  };
}
