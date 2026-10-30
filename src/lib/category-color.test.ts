import { describe, expect, it } from "vitest";
import { categoryTextColor } from "./category-color";

describe("categoryTextColor", () => {
  it("uses white text on a dark category color", () => {
    expect(categoryTextColor("#0066CC")).toBe("#FFFFFF");
    expect(categoryTextColor("#1A202C")).toBe("#FFFFFF");
  });

  it("leaves light category colors on the default text color", () => {
    expect(categoryTextColor("#E0E6ED")).toBeUndefined();
    expect(categoryTextColor("#E8DFF0")).toBeUndefined();
    expect(categoryTextColor("#FFFFFF")).toBeUndefined();
  });

  it("ignores colors that are not a 6-digit hex value", () => {
    expect(categoryTextColor("blue")).toBeUndefined();
    expect(categoryTextColor("#0066C")).toBeUndefined();
    expect(categoryTextColor("#0066CCFF")).toBeUndefined();
  });
});
