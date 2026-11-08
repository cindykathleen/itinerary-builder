export type TimelineDay = {
  iso: string;
  label: string;
};

export type TimelineActivityTime = {
  id: string;
  startDate: string | null;
  startTime: string | null;
  endTime: string | null;
};

type ActivityFrame = {
  startIndex: number;
  extraDays: number;
  startMinutes: number;
  endClock: number;
};

export type OverlapPlacement = {
  column: number;
  columns: number;
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const DAY_MINUTES = 24 * 60;

export function listDays(start: string, end: string): TimelineDay[] {
  const days: TimelineDay[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);

  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) {
    return days;
  }

  while (cursor.getTime() <= last.getTime()) {
    days.push({
      iso: cursor.toISOString().slice(0, 10),
      label: `${WEEKDAYS[cursor.getUTCDay()]}, ${cursor.getUTCMonth() + 1}/${cursor.getUTCDate()}`,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

export function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

export function validScheduleRange(
  dayStart: string,
  dayEnd: string,
  interval: number,
  startTime: string,
  endTime: string,
  extraDays = 0,
) {
  if (interval !== 30 && interval !== 60) {
    return false;
  }

  const start = toMinutes(dayStart);
  const end = toMinutes(dayEnd);
  const slot = toMinutes(startTime);
  const finish = toMinutes(endTime);

  if (start === null || end === null || slot === null || finish === null) {
    return false;
  }

  const latest = end + interval;
  const onGrid = (slot - start) % interval === 0;

  if (slot < start || slot > end || (slot !== end && !onGrid)) {
    return false;
  }

  const earliestFinish = extraDays > 0 ? start : slot;

  if (finish <= earliestFinish || finish > latest) {
    return false;
  }

  return finish === end || finish === latest || (finish - start) % interval === 0;
}

export function listSlots(start: string, end: string, interval: number) {
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);

  if (
    startMinutes === null ||
    endMinutes === null ||
    endMinutes < startMinutes ||
    (interval !== 30 && interval !== 60)
  ) {
    return [];
  }

  const slots: number[] = [];

  for (let minutes = startMinutes; minutes <= endMinutes; minutes += interval) {
    slots.push(minutes);
  }

  if (slots[slots.length - 1] !== endMinutes) {
    slots.push(endMinutes);
  }

  return slots;
}

export function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function formatTime(minutes: number, timeFormat: string) {
  const hours = Math.floor(minutes / 60);
  const mins = String(minutes % 60).padStart(2, "0");

  if (timeFormat === "24h") {
    return `${String(hours).padStart(2, "0")}:${mins}`;
  }

  const period = hours % 24 >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;

  return `${hour12}:${mins} ${period}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function describeSpan(endMinutes: number) {
  if (endMinutes <= DAY_MINUTES) {
    return { extraDays: 0, endClock: endMinutes };
  }

  const extraDays = Math.floor(endMinutes / DAY_MINUTES);
  const endClock = endMinutes % DAY_MINUTES;

  if (endClock === 0) {
    return { extraDays: extraDays - 1, endClock: DAY_MINUTES };
  }

  return { extraDays, endClock };
}

export function activityFrame(
  activity: Pick<TimelineActivityTime, "startDate" | "startTime" | "endTime">,
  dayList: TimelineDay[],
): ActivityFrame | null {
  if (!activity.startDate || !activity.startTime || !activity.endTime) {
    return null;
  }

  const startMinutes = toMinutes(activity.startTime);
  const endMinutes = toMinutes(activity.endTime);
  const startIndex = dayList.findIndex((day) => day.iso === activity.startDate);

  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes || startIndex < 0) {
    return null;
  }

  const span = describeSpan(endMinutes);
  const extraDays = Math.min(span.extraDays, Math.max(0, dayList.length - 1 - startIndex));

  if ((extraDays === 0 && span.endClock <= startMinutes) || span.endClock <= 0) {
    return null;
  }

  return { startIndex, extraDays, startMinutes, endClock: span.endClock };
}

export function daySlices(frame: ActivityFrame, dayStartMinutes: number, dayEndBoundary: number) {
  const slices: { dayIndex: number; startMinutes: number; endMinutes: number }[] = [];

  for (let offset = 0; offset <= frame.extraDays; offset += 1) {
    const first = offset === 0;
    const last = offset === frame.extraDays;
    const startMinutes = first ? frame.startMinutes : dayStartMinutes;
    const endMinutes = last ? frame.endClock : dayEndBoundary;

    if (endMinutes <= startMinutes) {
      continue;
    }

    slices.push({ dayIndex: frame.startIndex + offset, startMinutes, endMinutes });
  }

  return slices;
}

export function layoutOverlaps(
  activities: TimelineActivityTime[],
  dayList: TimelineDay[],
  dayStartMinutes: number,
  dayEndBoundary: number,
) {
  const byDay = new Map<number, { id: string; start: number; end: number }[]>();

  for (const activity of activities) {
    const frame = activityFrame(activity, dayList);

    if (!frame) {
      continue;
    }

    for (const slice of daySlices(frame, dayStartMinutes, dayEndBoundary)) {
      const group = byDay.get(slice.dayIndex) ?? [];
      group.push({ id: activity.id, start: slice.startMinutes, end: slice.endMinutes });
      byDay.set(slice.dayIndex, group);
    }
  }

  const placements = new Map<string, OverlapPlacement>();

  for (const [dayIndex, group] of byDay) {
    const events = [...group].sort(
      (left, right) => left.start - right.start || right.end - left.end || left.id.localeCompare(right.id),
    );
    let cluster: typeof events = [];
    let clusterEnd = -1;

    const assign = (members: typeof events) => {
      const columnEnds: number[] = [];
      const columns: number[] = [];

      for (const event of members) {
        let column = columnEnds.findIndex((end) => end <= event.start);

        if (column < 0) {
          column = columnEnds.length;
          columnEnds.push(event.end);
        } else {
          columnEnds[column] = event.end;
        }

        columns.push(column);
      }

      const count = columnEnds.length;

      members.forEach((event, index) => {
        placements.set(`${event.id}:${dayIndex}`, { column: columns[index], columns: count });
      });
    };

    for (const event of events) {
      if (cluster.length > 0 && event.start >= clusterEnd) {
        assign(cluster);
        cluster = [];
        clusterEnd = -1;
      }

      cluster.push(event);
      clusterEnd = Math.max(clusterEnd, event.end);
    }

    assign(cluster);
  }

  return placements;
}

export function overlapBox(placement: OverlapPlacement | undefined) {
  if (!placement || placement.columns <= 1) {
    return {};
  }

  const offset = Math.min(placement.column * 10, 30);

  return {
    width: `calc(${100 - offset}% - 4px)`,
    marginLeft: `calc(${offset}% + 2px)`,
    marginRight: 2,
    justifySelf: "start" as const,
    "--overlap": placement.column,
  };
}

export function scheduledRange(
  activity: TimelineActivityTime,
  date: string,
  startTime: string,
  dayEnd: string,
  timeInterval: number,
  dayList: TimelineDay[],
) {
  const startMinutes = toMinutes(startTime);
  const dayEndMinutes = toMinutes(dayEnd);
  const startIndex = dayList.findIndex((day) => day.iso === date);

  if (
    startMinutes === null ||
    dayEndMinutes === null ||
    startMinutes > dayEndMinutes ||
    startIndex < 0
  ) {
    return null;
  }

  const current = activityFrame(activity, dayList);
  const duration = current ? current.endClock - current.startMinutes : timeInterval;
  const extraDays = current?.extraDays ?? 0;
  const endClock = Math.min(startMinutes + duration, dayEndMinutes + timeInterval);

  if (endClock <= startMinutes || startIndex + extraDays >= dayList.length) {
    return null;
  }

  return { date, startTime, endTime: minutesToTime(extraDays * DAY_MINUTES + endClock) };
}

export function boundaryIndex(time: string | null, slots: number[]) {
  if (!time) {
    return -1;
  }

  const minutes = toMinutes(time);

  if (minutes === null) {
    return -1;
  }

  const exact = slots.indexOf(minutes);

  if (exact >= 0) {
    return exact;
  }

  const next = slots.findIndex((slot) => slot >= minutes);

  if (next >= 0) {
    return next;
  }

  if (slots.length > 0 && minutes > slots[slots.length - 1]) {
    return slots.length;
  }

  return -1;
}

export function placementCellKeys(
  placement: { date: string; startTime: string; endTime: string },
  dayList: TimelineDay[],
  dayStartMinutes: number,
  dayEndBoundary: number,
  slotList: number[],
) {
  const frame = activityFrame(
    {
      startDate: placement.date,
      startTime: placement.startTime,
      endTime: placement.endTime,
    },
    dayList,
  );

  if (!frame) {
    return [];
  }

  const keys: string[] = [];

  for (const slice of daySlices(frame, dayStartMinutes, dayEndBoundary)) {
    const day = dayList[slice.dayIndex];
    const startIndex = slotList.indexOf(slice.startMinutes);
    const endIndex = boundaryIndex(minutesToTime(slice.endMinutes), slotList);

    if (!day || startIndex < 0 || endIndex <= startIndex) {
      continue;
    }

    for (let index = startIndex; index < endIndex; index += 1) {
      keys.push(`${day.iso}|${slotList[index]}`);
    }
  }

  return keys;
}

export function clockTime(startDate: string | null, endDate: string | null, endTime: string | null) {
  if (!startDate || !endDate || !endTime || endDate <= startDate) {
    return endTime;
  }

  const [hours, minutes] = endTime.split(":").map(Number);
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const total = days * 24 * 60 + hours * 60 + minutes;

  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
