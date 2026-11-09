import { describe, expect, it } from "vitest";
import { placesForStop, type StopMapPlace } from "./map-stops";

const places: StopMapPlace[] = [
  {
    id: "place-park",
    googlePlaceId: "park",
    name: "Park",
    address: "1 Green St",
    latitude: 25.03,
    longitude: 121.56,
    activities: [
      {
        id: "logistics",
        name: "Airport bus",
        stopId: null,
        onTimeline: false,
        createdAt: "2026-06-01T00:00:00.000000Z",
        color: "#718096",
      },
      {
        id: "taipei-later",
        name: "Night market",
        stopId: "taipei",
        onTimeline: true,
        createdAt: "2026-06-03T00:00:00.000000Z",
        color: "#0066CC",
      },
      {
        id: "taipei-early",
        name: "Breakfast",
        stopId: "taipei",
        onTimeline: false,
        createdAt: "2026-06-02T00:00:00.000000Z",
        color: "#B2DFFF",
      },
    ],
  },
  {
    id: "place-hotel",
    googlePlaceId: "hotel",
    name: "Hotel",
    address: "2 Stay Rd",
    latitude: 22.99,
    longitude: 120.21,
    activities: [
      {
        id: "tainan",
        name: "Check in",
        stopId: "tainan",
        onTimeline: true,
        createdAt: "2026-06-04T00:00:00.000000Z",
        color: "#0050A3",
      },
    ],
  },
];

describe("placesForStop", () => {
  it("keeps every place and uses the earliest activity color for All", () => {
    const filtered = placesForStop(places, null);

    expect(filtered.map((place) => place.name)).toEqual(["Park", "Hotel"]);
    expect(filtered[0].color).toBe("#718096");
    expect(filtered[0].activities.map((activity) => activity.name)).toEqual([
      "Airport bus",
      "Breakfast",
      "Night market",
    ]);
  });

  it("keeps a place when one of its activities belongs to the stop", () => {
    const filtered = placesForStop(places, "taipei");

    expect(filtered.map((place) => place.googlePlaceId)).toEqual(["park"]);
    expect(filtered[0].color).toBe("#B2DFFF");
    expect(filtered[0].activities.map((activity) => activity.name)).toEqual([
      "Breakfast",
      "Night market",
    ]);
    expect(filtered[0].activityIds).toEqual(["taipei-early", "taipei-later"]);
  });

  it("leaves logistics places out of a stop view", () => {
    const logisticsOnly: StopMapPlace[] = [
      {
        ...places[0],
        activities: [places[0].activities[0]],
      },
    ];

    expect(placesForStop(logisticsOnly, "taipei")).toEqual([]);
    expect(placesForStop(logisticsOnly, null)).toHaveLength(1);
  });
});
