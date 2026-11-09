import { describe, expect, it } from "vitest";
import { sectionNames } from "./sections";

describe("sectionNames", () => {
  it("keeps trimmed names in order", () => {
    expect(sectionNames([" Morning ", "", "Afternoon", "Night"])).toEqual([
      "Morning",
      "Afternoon",
      "Night",
    ]);
  });

  it("rejects an empty list", () => {
    expect(() => sectionNames(["", "  "])).toThrow("A section is required.");
  });

  it("rejects a name longer than 40 characters", () => {
    expect(() => sectionNames(["m".repeat(41)])).toThrow(
      "Section name must be 40 characters or fewer.",
    );
  });

  it("rejects names that match regardless of case", () => {
    expect(() => sectionNames(["Morning", " morning "])).toThrow("Section names must be unique.");
  });

  it("rejects more than 12 sections", () => {
    const names = Array.from({ length: 13 }, (_, index) => `Section ${index + 1}`);
    expect(() => sectionNames(names)).toThrow("An itinerary can have at most 12 sections.");
  });
});
