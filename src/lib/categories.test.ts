import { describe, expect, it } from "vitest";
import { categoriesForStop } from "./categories";

const logistics = { id: "logistics", stopId: null };
const museum = { id: "museum", stopId: "stop-1" };
const park = { id: "park", stopId: "stop-2" };

describe("categoriesForStop", () => {
  it("returns logistics categories when no place is selected", () => {
    expect(categoriesForStop([logistics, museum, park], "")).toEqual([logistics]);
  });

  it("returns categories for the selected place", () => {
    expect(categoriesForStop([logistics, museum, park], "stop-1")).toEqual([museum]);
  });
});
