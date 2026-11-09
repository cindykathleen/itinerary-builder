import { describe, expect, it } from "vitest";
import { reorderSidebarActivities, sidebarBeforeId } from "./sidebar-order";

const activities = [
  { id: "a", scheduled: false },
  { id: "b", scheduled: false },
  { id: "c", scheduled: false },
  { id: "d", scheduled: true },
  { id: "e", scheduled: true },
];

describe("reorderSidebarActivities", () => {
  it("moves an activity before another in the same group", () => {
    expect(reorderSidebarActivities(activities, "c", "a", "before")?.map((item) => item.id)).toEqual([
      "c",
      "a",
      "b",
      "d",
      "e",
    ]);
  });

  it("moves an activity after another in the same group", () => {
    expect(reorderSidebarActivities(activities, "a", "c", "after")?.map((item) => item.id)).toEqual([
      "b",
      "c",
      "a",
      "d",
      "e",
    ]);
  });

  it("reorders activities that are already on the itinerary without leaving the bottom", () => {
    expect(reorderSidebarActivities(activities, "e", "d", "before")?.map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
      "e",
      "d",
    ]);
  });

  it("rejects a move between the open list and the itinerary list", () => {
    expect(reorderSidebarActivities(activities, "a", "d", "before")).toBeNull();
    expect(reorderSidebarActivities(activities, "d", "c", "after")).toBeNull();
  });

  it("rejects a move that does not change the order", () => {
    expect(reorderSidebarActivities(activities, "b", "a", "after")).toBeNull();
  });
});

describe("sidebarBeforeId", () => {
  it("returns the next activity in the same group", () => {
    const next = reorderSidebarActivities(activities, "c", "a", "before") ?? [];
    expect(sidebarBeforeId(next, "c")).toBe("a");
  });

  it("returns null when the activity is last in its group", () => {
    const next = reorderSidebarActivities(activities, "a", "c", "after") ?? [];
    expect(sidebarBeforeId(next, "a")).toBeNull();
  });
});
