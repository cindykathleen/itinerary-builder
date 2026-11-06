import { describe, expect, it } from "vitest";
import { moveSectionActivity, sectionDropIndex } from "./section-placement";

describe("sectionDropIndex", () => {
  it("inserts before another activity after removing the dragged one", () => {
    expect(sectionDropIndex(["a", "b", "c"], "a", "c")).toBe(1);
  });

  it("appends when there is no activity before the drop", () => {
    expect(sectionDropIndex(["a", "b"], "c", null)).toBe(2);
  });

  it("keeps the activity where it is when dropped on itself", () => {
    expect(sectionDropIndex(["a", "b"], "a", "a")).toBe(0);
  });
});

describe("moveSectionActivity", () => {
  const activities = [
    { id: "open", sectionId: null, sectionDate: null, position: null },
    { id: "a", sectionId: "morning", sectionDate: "2026-06-01", position: 0 },
    { id: "b", sectionId: "morning", sectionDate: "2026-06-01", position: 1 },
    { id: "c", sectionId: "night", sectionDate: "2026-06-01", position: 0 },
  ];

  it("appends a sidebar activity to the end of a cell", () => {
    expect(
      moveSectionActivity(activities, {
        id: "open",
        sectionId: "morning",
        sectionDate: "2026-06-01",
        position: 2,
      }).filter((activity) => activity.sectionId === "morning"),
    ).toEqual([
      { id: "a", sectionId: "morning", sectionDate: "2026-06-01", position: 0 },
      { id: "b", sectionId: "morning", sectionDate: "2026-06-01", position: 1 },
      { id: "open", sectionId: "morning", sectionDate: "2026-06-01", position: 2 },
    ]);
  });

  it("moves an activity between cells and closes the gap it left", () => {
    expect(
      moveSectionActivity(activities, {
        id: "c",
        sectionId: "morning",
        sectionDate: "2026-06-01",
        position: 1,
      }).map((activity) => [activity.id, activity.sectionId, activity.position]),
    ).toEqual([
      ["open", null, null],
      ["a", "morning", 0],
      ["c", "morning", 1],
      ["b", "morning", 2],
    ]);
  });
});
