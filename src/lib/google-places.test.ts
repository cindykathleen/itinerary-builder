import { afterEach, describe, expect, it, vi } from "vitest";
import { autocompletePlaces, getGooglePlace, GooglePlacesError } from "./google-places";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ referer: "http://localhost:3000/itineraries" }),
}));

describe("Google place fixtures", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns fixture suggestions without calling Google", async () => {
    vi.stubEnv("GOOGLE_PLACES_FIXTURES", "1");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(autocompletePlaces("park", null)).resolves.toEqual([
      {
        placeId: "fixture-park",
        name: "Fixture Park",
        address: "1 Fixture Way",
      },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns fixture details without calling Google", async () => {
    vi.stubEnv("GOOGLE_PLACES_FIXTURES", "1");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(getGooglePlace("fixture-hotel", null)).resolves.toMatchObject({
      placeId: "fixture-hotel",
      name: "Fixture Hotel",
      latitude: 35.0216,
      longitude: 135.7781,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a place id that is not in the fixture list", async () => {
    vi.stubEnv("GOOGLE_PLACES_FIXTURES", "1");

    await expect(getGooglePlace("missing-place", null)).rejects.toBeInstanceOf(GooglePlacesError);
  });

  it("sends the page referer so a referrer-restricted key can authorize the search", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ suggestions: [] }), { status: 200 }),
    );

    await autocompletePlaces("pizza", null);

    const [, init] = fetchSpy.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Referer")).toBe("http://localhost:3000/itineraries");
    expect(headers.get("X-Goog-Api-Key")).toBe("test-key");
  });
});
