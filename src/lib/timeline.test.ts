import { describe, expect, it } from "vitest";
import {
  activityFrame,
  clockTime,
  formatTime,
  layoutOverlaps,
  listDays,
  listSlots,
  overlapBox,
  placementCellKeys,
  scheduledRange,
  type TimelineActivityTime,
} from "./timeline";

const days = listDays("2026-10-29", "2026-10-30");
const slots = listSlots("08:00", "20:00", 30);
const dayStart = 8 * 60;
const dayEndBoundary = 20 * 60 + 30;

function activity(
  id: string,
  startTime: string,
  endTime: string,
  startDate = "2026-10-29",
): TimelineActivityTime {
  return { id, startDate, startTime, endTime };
}

describe("listDays", () => {
  it("lists each day in the range with a weekday label", () => {
    expect(listDays("2026-10-29", "2026-10-30")).toEqual([
      { iso: "2026-10-29", label: "Thursday, 10/29" },
      { iso: "2026-10-30", label: "Friday, 10/30" },
    ]);
  });

  it("returns nothing for an invalid or reversed range", () => {
    expect(listDays("nope", "2026-10-30")).toEqual([]);
    expect(listDays("2026-10-30", "2026-10-29")).toEqual([]);
  });
});

describe("listSlots", () => {
  it("builds a 30-minute grid and keeps the day end on the grid", () => {
    expect(listSlots("08:00", "09:00", 30)).toEqual([8 * 60, 8 * 60 + 30, 9 * 60]);
  });

  it("includes an end time that falls between intervals", () => {
    expect(listSlots("08:00", "09:15", 30)).toEqual([8 * 60, 8 * 60 + 30, 9 * 60, 9 * 60 + 15]);
  });

  it("rejects an interval other than 30 or 60 minutes", () => {
    expect(listSlots("08:00", "20:00", 15)).toEqual([]);
  });
});

describe("formatTime", () => {
  it("formats clock times in 12-hour and 24-hour labels", () => {
    expect(formatTime(0, "12h")).toBe("12:00 AM");
    expect(formatTime(0, "24h")).toBe("00:00");
    expect(formatTime(12 * 60, "12h")).toBe("12:00 PM");
    expect(formatTime(13 * 60, "12h")).toBe("1:00 PM");
    expect(formatTime(13 * 60, "24h")).toBe("13:00");
  });

  it("keeps hours past 24 in 24-hour labels and wraps them in 12-hour labels", () => {
    expect(formatTime(26 * 60, "24h")).toBe("26:00");
    expect(formatTime(26 * 60, "12h")).toBe("2:00 AM");
  });
});

describe("clockTime", () => {
  it("leaves an end time on the start date unchanged", () => {
    expect(clockTime("2026-10-29", "2026-10-29", "10:00")).toBe("10:00");
    expect(clockTime("2026-10-29", null, "10:00")).toBe("10:00");
  });

  it("folds later days into the end time hours", () => {
    expect(clockTime("2026-10-29", "2026-10-30", "02:00")).toBe("26:00");
  });
});

describe("activityFrame", () => {
  it("reads a multi-day end as an end clock on the next day", () => {
    expect(activityFrame(activity("walk", "09:00", "26:00"), days)).toEqual({
      startIndex: 0,
      extraDays: 1,
      startMinutes: 9 * 60,
      endClock: 2 * 60,
    });
  });
});

describe("layoutOverlaps", () => {
  it("keeps activities that only touch in a single column", () => {
    const placements = layoutOverlaps(
      [activity("walk", "09:00", "10:00"), activity("lunch", "10:00", "11:00")],
      days,
      dayStart,
      dayEndBoundary,
    );

    expect(placements.get("walk:0")).toEqual({ column: 0, columns: 1 });
    expect(placements.get("lunch:0")).toEqual({ column: 0, columns: 1 });
  });

  it("indents a later overlapping activity and gives the longer one the first column", () => {
    const placements = layoutOverlaps(
      [activity("short", "09:00", "10:00"), activity("long", "09:00", "12:00")],
      days,
      dayStart,
      dayEndBoundary,
    );

    expect(placements.get("long:0")).toEqual({ column: 0, columns: 2 });
    expect(placements.get("short:0")).toEqual({ column: 1, columns: 2 });
  });
});

describe("overlapBox", () => {
  it("leaves a single column at full width", () => {
    expect(overlapBox({ column: 0, columns: 1 })).toEqual({});
    expect(overlapBox(undefined)).toEqual({});
  });

  it("indents later columns by 10 percent, capped at 30 percent", () => {
    expect(overlapBox({ column: 1, columns: 2 })).toMatchObject({
      width: "calc(90% - 4px)",
      marginLeft: "calc(10% + 2px)",
      "--overlap": 1,
    });
    expect(overlapBox({ column: 4, columns: 5 })).toMatchObject({
      width: "calc(70% - 4px)",
      marginLeft: "calc(30% + 2px)",
      "--overlap": 4,
    });
  });
});

describe("scheduledRange", () => {
  const unscheduled: TimelineActivityTime = {
    id: "new",
    startDate: null,
    startTime: null,
    endTime: null,
  };

  it("gives an unscheduled activity one time interval", () => {
    expect(scheduledRange(unscheduled, "2026-10-29", "09:00", "20:00", 30, days)).toEqual({
      date: "2026-10-29",
      startTime: "09:00",
      endTime: "09:30",
    });
  });

  it("keeps the duration of an activity that is already on the timeline", () => {
    expect(
      scheduledRange(activity("walk", "09:00", "11:00"), "2026-10-29", "14:00", "20:00", 30, days),
    ).toEqual({
      date: "2026-10-29",
      startTime: "14:00",
      endTime: "16:00",
    });
  });

  it("rejects a start after the day end", () => {
    expect(
      scheduledRange(unscheduled, "2026-10-29", "21:00", "20:00", 30, days),
    ).toBeNull();
  });
});

describe("placementCellKeys", () => {
  it("covers every cell the activity occupies and leaves out the end boundary", () => {
    expect(
      placementCellKeys(
        { date: "2026-10-29", startTime: "09:00", endTime: "10:00" },
        days,
        dayStart,
        dayEndBoundary,
        slots,
      ),
    ).toEqual(["2026-10-29|540", "2026-10-29|570"]);
  });
});
