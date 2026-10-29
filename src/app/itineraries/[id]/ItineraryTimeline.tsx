"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DragEvent, PointerEvent as ReactPointerEvent } from "react";
import { deleteActivity, scheduleActivity, unscheduleActivity, updateActivity } from "../actions";
import { closeDialogOnEscape } from "../dialog";
import dialogStyles from "../dialog.module.css";
import ActivityEditDialog, { type EditableActivity } from "./ActivityEditDialog";
import { useActivityHighlight } from "./ActivityHighlight";
import ActivityCreate, { type ActivitySlot } from "./ActivityCreate";
import { categoryTextColor } from "./CategoryItem";
import type { CategoryOption } from "./CategorySelect";
import type { StopOption } from "./StopSelect";
import DayHeader from "./DayHeader";
import styles from "./ItineraryTimeline.module.css";

type TimelineActivity = {
  id: string;
  name: string;
  color: string;
  note: string | null;
  categoryId: string | null;
  stopId: string | null;
  googlePlaceId: string | null;
  googlePlaceName: string | null;
  googlePlaceAddress: string | null;
  inSidebar: boolean;
  startDate: string | null;
  startTime: string | null;
  endTime: string | null;
};

type TimelineDay = {
  iso: string;
  label: string;
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

function listDays(start: string, end: string): TimelineDay[] {
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

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function listSlots(start: string, end: string, interval: number) {
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

function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function formatTime(minutes: number, timeFormat: string) {
  const hours = Math.floor(minutes / 60);
  const mins = String(minutes % 60).padStart(2, "0");

  if (timeFormat === "24h") {
    return `${String(hours).padStart(2, "0")}:${mins}`;
  }

  const period = hours % 24 >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;

  return `${hour12}:${mins} ${period}`;
}

const DAY_MINUTES = 24 * 60;

function clamp(value: number, min: number, max: number) {
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

function hasDragType(dataTransfer: DataTransfer, type: string) {
  return Array.from(dataTransfer.types).includes(type);
}

function dateAtX(root: HTMLElement, clientX: number) {
  const seen = new Map<string, DOMRect>();

  for (const cell of root.querySelectorAll<HTMLElement>("[data-date]")) {
    const date = cell.dataset.date;

    if (!date || seen.has(date)) {
      continue;
    }

    seen.set(date, cell.getBoundingClientRect());
  }

  const columns = [...seen.entries()];

  if (columns.length === 0) {
    return null;
  }

  if (clientX < columns[0][1].left) {
    return columns[0][0];
  }

  const last = columns[columns.length - 1];

  if (clientX >= last[1].right) {
    return last[0];
  }

  return columns.find(([, rect]) => clientX >= rect.left && clientX < rect.right)?.[0] ?? null;
}

function cellAtPoint(root: HTMLElement, clientX: number, clientY: number) {
  const cells = root.querySelectorAll<HTMLElement>("[data-date][data-minutes]");

  for (const cell of cells) {
    const rect = cell.getBoundingClientRect();

    if (clientX >= rect.left && clientX < rect.right && clientY >= rect.top && clientY < rect.bottom) {
      return cell;
    }
  }

  return null;
}

type ActivityFrame = {
  startIndex: number;
  extraDays: number;
  startMinutes: number;
  endClock: number;
};

function activityFrame(
  activity: Pick<TimelineActivity, "startDate" | "startTime" | "endTime">,
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

function daySlices(frame: ActivityFrame, dayStartMinutes: number, dayEndBoundary: number) {
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

type OverlapPlacement = {
  column: number;
  columns: number;
};

function layoutOverlaps(
  activities: TimelineActivity[],
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

function overlapBox(placement: OverlapPlacement | undefined) {
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

function scheduledRange(
  activity: TimelineActivity,
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

function boundaryIndex(time: string | null, slots: number[]) {
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

function placementCellKeys(
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

function BlockNote({
  activity,
  dayIndex,
  onPlace,
  onCommit,
}: {
  activity: TimelineActivity;
  dayIndex: number;
  onPlace: (block: HTMLDivElement) => void;
  onCommit: (activity: TimelineActivity, note: string) => void;
}) {
  const note = activity.note ?? "";
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const onPlaceRef = useRef(onPlace);
  const revertRef = useRef(false);
  const savedRef = useRef(note);
  const commitRef = useRef<(raw: string) => void>(() => {});
  const [value, setValue] = useState(note);

  useEffect(() => {
    savedRef.current = note;

    if (document.activeElement === fieldRef.current) {
      return;
    }

    setValue(note);
  }, [note]);

  useEffect(() => {
    const commitOnOutsidePointer = (event: PointerEvent) => {
      const field = fieldRef.current;

      if (!field || document.activeElement !== field) {
        return;
      }

      if (event.target instanceof Node && field.parentElement?.contains(event.target)) {
        return;
      }

      commitRef.current(field.value);
      field.blur();
      event.preventDefault();
      event.stopPropagation();

      const swallow = (followup: Event) => {
        followup.preventDefault();
        followup.stopPropagation();
      };
      const followups = ["mousedown", "pointerup", "mouseup", "click"] as const;

      for (const type of followups) {
        document.addEventListener(type, swallow, true);
      }

      const release = () => {
        for (const type of followups) {
          document.removeEventListener(type, swallow, true);
        }
      };

      document.addEventListener("pointerup", () => setTimeout(release, 0), { capture: true, once: true });
      document.addEventListener("pointercancel", () => setTimeout(release, 0), { capture: true, once: true });
    };

    document.addEventListener("pointerdown", commitOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", commitOnOutsidePointer, true);
  }, []);

  commitRef.current = (raw: string) => {
    if (revertRef.current) {
      return;
    }

    const next = raw.trim();

    if (next === savedRef.current.trim()) {
      return;
    }

    savedRef.current = next;
    onCommit(activity, next);
  };

  useLayoutEffect(() => {
    onPlaceRef.current = onPlace;
  }, [onPlace]);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    const block = field?.closest(`.${styles.block}`);

    if (!(block instanceof HTMLDivElement) || !field) {
      return;
    }

    if (document.activeElement === field || block.matches(":hover")) {
      onPlaceRef.current(block);
    }
  }, [value]);

  return (
    <div
      className={styles.blockNote}
      role="tooltip"
      data-no-drag
      onPointerDown={(event) => {
        event.stopPropagation();

        if (event.target === event.currentTarget) {
          fieldRef.current?.focus();
        }
      }}
    >
      <span className={styles.blockNoteSizer} aria-hidden="true">
        {value}
        {"\u200b"}
      </span>
      <textarea
        ref={fieldRef}
        id={`activity-note-${activity.id}-${dayIndex}`}
        className={styles.blockNoteField}
        aria-label={`Note for ${activity.name}`}
        data-no-drag
        value={value}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => setValue(event.target.value)}
        onBlur={(event) => {
          if (revertRef.current) {
            revertRef.current = false;
            setValue(note);
            return;
          }

          commitRef.current(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          revertRef.current = true;
          setValue(note);
          event.currentTarget.blur();
        }}
      />
    </div>
  );
}

export default function ItineraryTimeline({
  itineraryId,
  dateStart,
  dateEnd,
  dayStart,
  dayEnd,
  timeInterval,
  timeFormat,
  daySettings,
  activities,
  categories,
  stops,
}: {
  itineraryId: string;
  dateStart: string;
  dateEnd: string;
  dayStart: string;
  dayEnd: string;
  timeInterval: number;
  timeFormat: string;
  daySettings: { date: string; heading: string | null }[];
  activities: TimelineActivity[];
  categories: CategoryOption[];
  stops: StopOption[];
}) {
  const days = listDays(dateStart, dateEnd);
  const slots = listSlots(dayStart, dayEnd, timeInterval);
  const headings = new Map(daySettings.map((day) => [day.date, day.heading?.trim() ?? ""]));
  const boundaryMinutes = (index: number) => {
    if (index < slots.length) {
      return slots[index];
    }

    return slots[slots.length - 1] + timeInterval;
  };
  const timelineRef = useRef<HTMLElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const createRef = useRef<HTMLDialogElement>(null);
  const draggedIdRef = useRef<string | null>(null);
  const [items, setItems] = useState(activities);
  const [overKeys, setOverKeys] = useState<string[]>([]);
  const [pointerKey, setPointerKey] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropBlocked, setDropBlocked] = useState(false);
  const [movePreview, setMovePreview] = useState<{
    id: string;
    date: string;
    startTime: string;
    endTime: string;
  } | null>(null);
  const [pendingRemove, setPendingRemove] = useState<TimelineActivity | null>(null);
  const [editing, setEditing] = useState<EditableActivity | null>(null);
  const [editToken, setEditToken] = useState(0);
  const [pendingCreate, setPendingCreate] = useState<ActivitySlot | null>(null);
  const [draft, setDraft] = useState<{ date: string; startIndex: number; endIndex: number } | null>(null);
  const highlight = useActivityHighlight();
  const hoveredId = highlight?.hoveredId ?? null;
  const axisKey = overKeys[0] ?? (dragging ? null : pointerKey);
  const axisSeparator = axisKey?.indexOf("|") ?? -1;
  const axisDate = axisKey && axisSeparator >= 0 ? axisKey.slice(0, axisSeparator) : null;
  const axisMinutes = new Set<number>();

  if (overKeys.length > 0) {
    for (const key of overKeys) {
      axisMinutes.add(Number(key.slice(key.indexOf("|") + 1)));
    }
  } else if (axisSeparator >= 0 && axisKey) {
    axisMinutes.add(Number(axisKey.slice(axisSeparator + 1)));
  }

  useEffect(() => {
    setItems(activities);
  }, [activities]);

  useEffect(() => {
    const timeline = timelineRef.current;

    if (!timeline || !hoveredId) {
      return;
    }

    const block = timeline.querySelector<HTMLElement>(
      `[data-activity-id="${CSS.escape(hoveredId)}"]`,
    );

    if (!block) {
      return;
    }

    const corner = timeline.querySelector<HTMLElement>(`.${CSS.escape(styles.corner)}`);
    const timelineRect = timeline.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    const cornerRect = corner?.getBoundingClientRect();
    const viewTop = timelineRect.top + (cornerRect?.height ?? 0);
    const viewLeft = timelineRect.left + (cornerRect?.width ?? 0);
    let top = 0;
    let left = 0;

    if (blockRect.top < viewTop) {
      top = blockRect.top - viewTop;
    } else if (blockRect.bottom > timelineRect.bottom) {
      top = blockRect.bottom - timelineRect.bottom;
    }

    if (blockRect.left < viewLeft) {
      left = blockRect.left - viewLeft;
    } else if (blockRect.right > timelineRect.right) {
      left = blockRect.right - timelineRect.right;
    }

    if (top !== 0 || left !== 0) {
      timeline.scrollBy({ top, left });
    }
  }, [hoveredId]);

  useEffect(() => {
    const rememberDrag = (event: DragEvent) => {
      draggedIdRef.current = event.dataTransfer?.getData("text/plain") || null;
    };
    const stopDragging = () => {
      draggedIdRef.current = null;
      timelineRef.current?.classList.remove(styles.dragging);
      setDragging(false);
      setDropBlocked(false);
      setOverKeys([]);
    };
    window.addEventListener("dragstart", rememberDrag);
    window.addEventListener("dragend", stopDragging);
    return () => {
      window.removeEventListener("dragstart", rememberDrag);
      window.removeEventListener("dragend", stopDragging);
    };
  }, []);

  useEffect(() => {
    if (pendingRemove) {
      confirmRef.current?.showModal();
    }
  }, [pendingRemove]);

  useEffect(() => {
    if (pendingCreate) {
      createRef.current?.showModal();
    }
  }, [pendingCreate]);

  const dayStartMinutes = toMinutes(dayStart) ?? slots[0] ?? 0;
  const dayEndBoundary = slots.length > 0 ? boundaryMinutes(slots.length) : 0;

  const selectionRange = (anchorIndex: number, pointerIndex: number) => {
    if (pointerIndex >= anchorIndex) {
      return { startIndex: anchorIndex, endIndex: pointerIndex + 1 };
    }

    return { startIndex: pointerIndex, endIndex: anchorIndex + 1 };
  };

  const beginCreate = (event: ReactPointerEvent<HTMLDivElement>, day: TimelineDay, minutes: number) => {
    if (event.button !== 0) {
      return;
    }

    const anchorIndex = slots.indexOf(minutes);

    if (anchorIndex < 0) {
      return;
    }

    event.preventDefault();
    const originX = event.clientX;
    const originY = event.clientY;
    let moved = false;
    let scrolledThisFrame = false;
    let selection = { startIndex: anchorIndex, endIndex: anchorIndex + 1 };

    const slotIndexAt = (clientY: number) => {
      const root = timelineRef.current;

      if (!root) {
        return anchorIndex;
      }

      const cells = [...root.querySelectorAll<HTMLElement>(`[data-date="${day.iso}"][data-minutes]`)];

      if (cells.length === 0) {
        return anchorIndex;
      }

      const first = cells[0].getBoundingClientRect();
      const last = cells[cells.length - 1].getBoundingClientRect();

      if (clientY < first.top) {
        return 0;
      }

      if (clientY >= last.bottom) {
        return cells.length - 1;
      }

      const match = cells.find((cell) => {
        const rect = cell.getBoundingClientRect();
        return clientY >= rect.top && clientY < rect.bottom;
      });
      const index = match?.dataset.minutes ? slots.indexOf(Number(match.dataset.minutes)) : -1;

      return index < 0 ? anchorIndex : index;
    };

    const onMove = (pointerEvent: PointerEvent) => {
      if (!moved) {
        if (Math.hypot(pointerEvent.clientX - originX, pointerEvent.clientY - originY) < 4) {
          return;
        }

        moved = true;
      }

      const scroller = timelineRef.current;

      if (scroller && !scrolledThisFrame) {
        const rect = scroller.getBoundingClientRect();
        const header = scroller.querySelector(`.${styles.day}`);
        const headerBottom = header?.getBoundingClientRect().bottom ?? rect.top;
        const edge = 36;
        let deltaY = 0;

        if (pointerEvent.clientY >= headerBottom && pointerEvent.clientY < headerBottom + edge) {
          deltaY = -18;
        } else if (pointerEvent.clientY > rect.bottom - edge) {
          deltaY = 18;
        }

        if (deltaY !== 0) {
          scroller.scrollTop += deltaY;
          scrolledThisFrame = true;
          requestAnimationFrame(() => {
            scrolledThisFrame = false;
          });
        }
      }

      selection = selectionRange(anchorIndex, slotIndexAt(pointerEvent.clientY));
      setDraft({ date: day.iso, ...selection });
    };

    const onUp = (pointerEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      const startMinutes = slots[selection.startIndex];
      const endMinutes = boundaryMinutes(selection.endIndex);

      if (
        pointerEvent.type === "pointercancel" ||
        startMinutes === undefined ||
        endMinutes <= startMinutes
      ) {
        setDraft(null);
        return;
      }

      setDraft({ date: day.iso, ...selection });
      setPendingCreate({
        date: day.iso,
        startTime: minutesToTime(startMinutes),
        endTime: minutesToTime(endMinutes),
        label: `${day.label}, ${formatTime(startMinutes, timeFormat)} – ${formatTime(endMinutes, timeFormat)}`,
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const canPlace = (id: string, date: string, startTime: string) => {
    const activity = items.find((item) => item.id === id);
    const placement = activity
      ? scheduledRange(activity, date, startTime, dayEnd, timeInterval, days)
      : null;

    return placement !== null;
  };

  const placeActivity = async (id: string, date: string, startTime: string) => {
    const current = items.find((activity) => activity.id === id);
    const placement = current
      ? scheduledRange(current, date, startTime, dayEnd, timeInterval, days)
      : null;

    if (!current || !placement) {
      return;
    }

    if (
      current.startDate === placement.date &&
      current.startTime === placement.startTime &&
      current.endTime === placement.endTime
    ) {
      return;
    }

    const previous = items;
    setItems((currentItems) =>
      currentItems.map((activity) =>
        activity.id === id
          ? {
              ...activity,
              startDate: placement.date,
              startTime: placement.startTime,
              endTime: placement.endTime,
            }
          : activity,
      ),
    );

    try {
      await scheduleActivity({ itineraryId, id, ...placement });
    } catch {
      setItems(previous);
    }
  };

  const editPlacedActivity = (activity: TimelineActivity) => {
    setEditing({
      id: activity.id,
      name: activity.name,
      note: activity.note,
      googlePlaceId: activity.googlePlaceId,
      googlePlaceName: activity.googlePlaceName,
      googlePlaceAddress: activity.googlePlaceAddress,
      categoryId: activity.categoryId,
      stopId: activity.stopId,
      inSidebar: activity.inSidebar,
    });
    setEditToken((token) => token + 1);
  };

  const placeBlockNote = (block: HTMLDivElement) => {
    const note = block.querySelector<HTMLElement>(`.${styles.blockNote}`);
    const timeline = timelineRef.current;

    if (!note || !timeline) {
      return;
    }

    const wasHidden = getComputedStyle(note).display === "none";

    if (wasHidden) {
      note.style.display = "block";
      note.style.visibility = "hidden";
    }

    const noteWidth = note.getBoundingClientRect().width;

    if (wasHidden) {
      note.style.display = "";
      note.style.visibility = "";
    }

    const blockRect = block.getBoundingClientRect();
    const timelineRect = timeline.getBoundingClientRect();
    const visibleRight = timelineRect.left + timeline.clientWidth;
    const fitsRight = blockRect.right + 2 + noteWidth <= visibleRight;
    note.classList.toggle(styles.blockNoteLeft, !fitsRight);
  };

  const saveActivityNote = async (activity: TimelineActivity, note: string) => {
    const next = note.trim();

    if ((activity.note?.trim() ?? "") === next) {
      return;
    }

    const previous = items;
    setItems((currentItems) =>
      currentItems.map((item) => (item.id === activity.id ? { ...item, note: next || null } : item)),
    );

    const formData = new FormData();
    formData.set("itineraryId", itineraryId);
    formData.set("id", activity.id);
    formData.set("name", activity.name);
    formData.set("note", next);

    if (activity.categoryId) {
      formData.set("categoryId", activity.categoryId);
    }

    if (activity.stopId) {
      formData.set("stopId", activity.stopId);
    }

    if (activity.googlePlaceId) {
      formData.set("googlePlaceId", activity.googlePlaceId);
    }

    try {
      await updateActivity(formData);
    } catch {
      setItems(previous);
    }
  };

  const movePlacedActivity = (activity: TimelineActivity, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("[data-no-drag]")) {
      return;
    }

    event.preventDefault();
    const originX = event.clientX;
    const originY = event.clientY;
    let moved = false;
    let next: { date: string; startTime: string; endTime: string } | null = null;
    let scrolledThisFrame = false;

    const onMove = (pointerEvent: PointerEvent) => {
      if (!moved) {
        if (Math.hypot(pointerEvent.clientX - originX, pointerEvent.clientY - originY) < 4) {
          return;
        }

        moved = true;
        timelineRef.current?.classList.add(styles.dragging);
        setDragging(true);
      }

      const scroller = timelineRef.current;

      if (scroller && !scrolledThisFrame) {
        const rect = scroller.getBoundingClientRect();
        const header = scroller.querySelector(`.${styles.day}`);
        const headerBottom = header?.getBoundingClientRect().bottom ?? rect.top;
        const edge = 36;
        let deltaY = 0;
        let deltaX = 0;

        if (pointerEvent.clientY >= headerBottom && pointerEvent.clientY < headerBottom + edge) {
          deltaY = -18;
        } else if (pointerEvent.clientY > rect.bottom - edge) {
          deltaY = 18;
        }

        if (pointerEvent.clientX < rect.left + edge) {
          deltaX = -18;
        } else if (pointerEvent.clientX > rect.right - edge) {
          deltaX = 18;
        }

        if (deltaX !== 0 || deltaY !== 0) {
          scroller.scrollTop += deltaY;
          scroller.scrollLeft += deltaX;
          scrolledThisFrame = true;
          requestAnimationFrame(() => {
            scrolledThisFrame = false;
          });
        }
      }

      const cell = timelineRef.current
        ? cellAtPoint(timelineRef.current, pointerEvent.clientX, pointerEvent.clientY)
        : null;

      if (!cell?.dataset.date || !cell.dataset.minutes) {
        return;
      }

      const placement = scheduledRange(
        activity,
        cell.dataset.date,
        minutesToTime(Number(cell.dataset.minutes)),
        dayEnd,
        timeInterval,
        days,
      );

      if (!placement) {
        next = null;
        setOverKeys([]);
        setMovePreview(null);
        setDropBlocked(true);
        return;
      }

      next = placement;
      setDropBlocked(false);
      setOverKeys(placementCellKeys(placement, days, dayStartMinutes, dayEndBoundary, slots));
      setMovePreview({ id: activity.id, ...placement });
    };

    const onUp = (pointerEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      timelineRef.current?.classList.remove(styles.dragging);
      setDragging(false);
      setDropBlocked(false);
      setOverKeys([]);
      setMovePreview(null);

      if (!moved) {
        if (pointerEvent.type === "pointerup") {
          editPlacedActivity(activity);
        }

        return;
      }

      if (!next) {
        return;
      }

      void placeActivity(activity.id, next.date, next.startTime);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const resizeActivity = (
    activity: TimelineActivity,
    edge: "start" | "end",
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const frame = activityFrame(activity, days);
    const startIndex = frame ? slots.indexOf(frame.startMinutes) : -1;
    const endIndex = frame ? boundaryIndex(minutesToTime(frame.endClock), slots) : -1;

    if (
      !frame ||
      startIndex < 0 ||
      endIndex < 0 ||
      !activity.startDate ||
      (frame.extraDays === 0 && endIndex <= startIndex)
    ) {
      return;
    }

    const row =
      (event.currentTarget.closest(`.${styles.grid}`)?.querySelector(`.${styles.cell}`) as
        | HTMLElement
        | null)?.offsetHeight || 36;
    const originY = event.clientY;
    const originStart = startIndex;
    const originEnd = endIndex;
    let nextStart = originStart;
    let nextEnd = originEnd;
    const previous = items;

    const apply = (clientY: number) => {
      const delta = Math.round((clientY - originY) / row);

      if (edge === "end") {
        nextStart = originStart;
        nextEnd = clamp(
          originEnd + delta,
          frame.extraDays > 0 ? 1 : originStart + 1,
          slots.length,
        );
      } else {
        nextStart = clamp(
          originStart + delta,
          0,
          frame.extraDays > 0 ? slots.length - 1 : originEnd - 1,
        );
        nextEnd = originEnd;
      }

      const startTime = minutesToTime(slots[nextStart]);
      const endTime = minutesToTime(frame.extraDays * DAY_MINUTES + boundaryMinutes(nextEnd));
      setItems((current) =>
        current.map((item) =>
          item.id === activity.id ? { ...item, startTime, endTime } : item,
        ),
      );
    };

    const onMove = (pointerEvent: PointerEvent) => apply(pointerEvent.clientY);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const startTime = minutesToTime(slots[nextStart]);
      const endTime = minutesToTime(frame.extraDays * DAY_MINUTES + boundaryMinutes(nextEnd));
      const originalEnd = activity.endTime ?? minutesToTime(boundaryMinutes(originEnd));

      if (startTime === activity.startTime && endTime === originalEnd) {
        return;
      }

      void scheduleActivity({
        itineraryId,
        id: activity.id,
        date: activity.startDate ?? "",
        startTime,
        endTime,
      }).catch(() => setItems(previous));
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const resizeActivityDays = (
    activity: TimelineActivity,
    edge: "start" | "end",
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const frame = activityFrame(activity, days);

    if (!frame || !activity.startTime) {
      return;
    }

    const originEnd = frame.startIndex + frame.extraDays;
    let nextStart = frame.startIndex;
    let nextEnd = originEnd;
    const previous = items;
    let scrolledThisFrame = false;

    const apply = (clientX: number) => {
      const root = timelineRef.current;
      const date = root ? dateAtX(root, clientX) : null;
      const column = date ? days.findIndex((day) => day.iso === date) : -1;

      if (column < 0) {
        return;
      }

      const candidateStart = edge === "end" ? frame.startIndex : clamp(column, 0, originEnd);
      const candidateEnd = edge === "end" ? clamp(column, frame.startIndex, days.length - 1) : originEnd;
      const extraDays = candidateEnd - candidateStart;
      const endTime = minutesToTime(extraDays * DAY_MINUTES + frame.endClock);
      const placement = {
        date: days[candidateStart].iso,
        startTime: activity.startTime ?? "",
        endTime,
      };

      nextStart = candidateStart;
      nextEnd = candidateEnd;
      setItems((current) =>
        current.map((item) =>
          item.id === activity.id
            ? { ...item, startDate: placement.date, endTime: placement.endTime }
            : item,
        ),
      );
    };

    const onMove = (pointerEvent: PointerEvent) => {
      const scroller = timelineRef.current;

      if (scroller && !scrolledThisFrame) {
        const rect = scroller.getBoundingClientRect();
        const edgeDistance = 36;
        let deltaX = 0;

        if (pointerEvent.clientX < rect.left + edgeDistance) {
          deltaX = -18;
        } else if (pointerEvent.clientX > rect.right - edgeDistance) {
          deltaX = 18;
        }

        if (deltaX !== 0) {
          scroller.scrollLeft += deltaX;
          scrolledThisFrame = true;
          requestAnimationFrame(() => {
            scrolledThisFrame = false;
          });
        }
      }

      apply(pointerEvent.clientX);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const startDate = days[nextStart]?.iso;
      const endTime = minutesToTime((nextEnd - nextStart) * DAY_MINUTES + frame.endClock);

      if (!startDate || (startDate === activity.startDate && endTime === activity.endTime)) {
        return;
      }

      void scheduleActivity({
        itineraryId,
        id: activity.id,
        date: startDate,
        startTime: activity.startTime ?? "",
        endTime,
      }).catch(() => setItems(previous));
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const allowDrop = (event: DragEvent<HTMLDivElement>, date: string, minutes: number) => {
    const id = draggedIdRef.current;

    if (!id || !hasDragType(event.dataTransfer, "text/plain") || !canPlace(id, date, minutesToTime(minutes))) {
      event.dataTransfer.dropEffect = "none";
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const removePlacedActivity = async () => {
    const activity = pendingRemove;

    if (!activity) {
      return;
    }

    const previous = items;
    confirmRef.current?.close();
    setItems((current) =>
      activity.inSidebar
        ? current.map((item) =>
            item.id === activity.id
              ? { ...item, startDate: null, startTime: null, endTime: null }
              : item,
          )
        : current.filter((item) => item.id !== activity.id),
    );

    try {
      if (activity.inSidebar) {
        await unscheduleActivity({ itineraryId, id: activity.id });
        return;
      }

      const formData = new FormData();
      formData.set("itineraryId", itineraryId);
      formData.set("id", activity.id);
      await deleteActivity(formData);
    } catch {
      setItems(previous);
    }
  };

  const overlapLayout = layoutOverlaps(
    items.map((activity) =>
      movePreview?.id === activity.id
        ? {
            ...activity,
            startDate: movePreview.date,
            startTime: movePreview.startTime,
            endTime: movePreview.endTime,
          }
        : activity,
    ),
    days,
    dayStartMinutes,
    dayEndBoundary,
  );

  return (
    <section
      ref={timelineRef}
      className={[styles.timeline, dragging ? styles.dragging : "", dropBlocked ? styles.dragBlocked : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label="Timeline"
      onDragEnter={(event) => {
        if (hasDragType(event.dataTransfer, "text/plain")) {
          timelineRef.current?.classList.add(styles.dragging);
          setDragging(true);
        }
      }}
    >
      <div
        className={styles.grid}
        style={{
          gridTemplateColumns: `96px repeat(${days.length}, minmax(152px, 1fr))`,
          gridTemplateRows: `auto repeat(${slots.length}, 40px)`,
        }}
      >
        <div className={styles.corner}>
          <span className={styles.srOnly}>Time</span>
        </div>
        {days.map((day, column) => (
          <div
            key={day.iso}
            className={[styles.day, axisDate === day.iso ? styles.axis : ""].filter(Boolean).join(" ")}
            style={{ gridColumn: column + 2, gridRow: 1 }}
          >
            <DayHeader
              itineraryId={itineraryId}
              date={day.iso}
              label={day.label}
              heading={headings.get(day.iso) ?? ""}
            />
            <div className={styles.date}>{day.label}</div>
          </div>
        ))}
        {slots.map((minutes, row) => (
          <div
            key={minutes}
            className={[styles.time, axisMinutes.has(minutes) ? styles.axis : ""].filter(Boolean).join(" ")}
            style={{ gridColumn: 1, gridRow: row + 2 }}
          >
            {formatTime(minutes, timeFormat)}
          </div>
        ))}
        {slots.map((minutes, row) =>
          days.map((day, column) => {
            const key = `${day.iso}|${minutes}`;
            const dayEndMinutes = toMinutes(dayEnd);
            const canDrop = dayEndMinutes !== null && minutes <= dayEndMinutes;

            return (
              <div
                key={key}
                className={[
                  styles.cell,
                  column === 0 ? styles.cellFirst : "",
                  canDrop ? styles.cellClickable : "",
                  overKeys.includes(key) ? styles.cellOver : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ gridColumn: column + 2, gridRow: row + 2 }}
                data-date={canDrop ? day.iso : undefined}
                data-minutes={canDrop ? minutes : undefined}
                onPointerEnter={canDrop ? () => setPointerKey(key) : undefined}
                onPointerLeave={
                  canDrop
                    ? () => setPointerKey((current) => (current === key ? null : current))
                    : undefined
                }
                onPointerDown={canDrop ? (event) => beginCreate(event, day, minutes) : undefined}
                onDragEnter={
                  canDrop
                    ? (event) => {
                        const id = draggedIdRef.current;
                        const activity = id ? items.find((item) => item.id === id) : undefined;
                        const placement =
                          activity && hasDragType(event.dataTransfer, "text/plain")
                            ? scheduledRange(
                                activity,
                                day.iso,
                                minutesToTime(minutes),
                                dayEnd,
                                timeInterval,
                                days,
                              )
                            : null;

                        if (!activity || !placement) {
                          setOverKeys([]);
                          setDropBlocked(true);
                          return;
                        }

                        setDropBlocked(false);
                        setOverKeys(
                          placementCellKeys(placement, days, dayStartMinutes, dayEndBoundary, slots),
                        );
                      }
                    : undefined
                }
                onDragOver={canDrop ? (event) => allowDrop(event, day.iso, minutes) : undefined}
                onDragLeave={
                  canDrop
                    ? (event) => {
                        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          return;
                        }

                        const next = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
                        const nextKey =
                          next?.dataset.date && next.dataset.minutes
                            ? `${next.dataset.date}|${next.dataset.minutes}`
                            : null;

                        setOverKeys((current) => (nextKey && current.includes(nextKey) ? current : []));
                      }
                    : undefined
                }
                onDrop={
                  canDrop
                    ? (event) => {
                        event.preventDefault();
                        setOverKeys([]);
                        const id = event.dataTransfer.getData("text/plain");

                        if (!canPlace(id, day.iso, minutesToTime(minutes))) {
                          return;
                        }

                        void placeActivity(id, day.iso, minutesToTime(minutes));
                      }
                    : undefined
                }
              />
            );
          }),
        )}
        {draft
          ? days.map((day, column) => {
              if (day.iso !== draft.date) {
                return null;
              }

              return (
                <div
                  key="draft"
                  className={styles.draft}
                  style={{
                    gridColumn: column + 2,
                    gridRow: `${draft.startIndex + 2} / ${draft.endIndex + 2}`,
                  }}
                >
                  <span>
                    {formatTime(slots[draft.startIndex], timeFormat)} –{" "}
                    {formatTime(boundaryMinutes(draft.endIndex), timeFormat)}
                  </span>
                </div>
              );
            })
          : null}
        {items.map((activity) => {
          const shown =
            movePreview?.id === activity.id
              ? {
                  ...activity,
                  startDate: movePreview.date,
                  startTime: movePreview.startTime,
                  endTime: movePreview.endTime,
                }
              : activity;

          if (!shown.startDate || !shown.startTime) {
            return null;
          }

          const frame = activityFrame(shown, days);

          if (!frame) {
            return null;
          }

          return daySlices(frame, dayStartMinutes, dayEndBoundary).map((slice, index, slices) => {
            const startIndex = slots.indexOf(slice.startMinutes);
            const endIndex = boundaryIndex(minutesToTime(slice.endMinutes), slots);
            const first = index === 0;
            const last = index === slices.length - 1;

            if (startIndex < 0 || endIndex <= startIndex) {
              return null;
            }

            const note = activity.note?.trim() ?? "";
            const overlap = overlapLayout.get(`${activity.id}:${slice.dayIndex}`);

            return (
              <div
                key={`${activity.id}-${slice.dayIndex}`}
                data-activity-id={activity.id}
                className={[
                  styles.block,
                  note ? styles.blockNoted : "",
                  overlap && overlap.columns > 1 ? styles.blockOverlap : "",
                  movePreview?.id === activity.id ? styles.blockMoving : "",
                  hoveredId === activity.id ? styles.blockHighlighted : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={activity.name}
                aria-describedby={note ? `activity-note-${activity.id}-${slice.dayIndex}` : undefined}
                style={{
                  gridColumn: slice.dayIndex + 2,
                  gridRow: `${startIndex + 2} / ${endIndex + 2}`,
                  backgroundColor: activity.color,
                  color: categoryTextColor(activity.color) ?? "var(--text-primary)",
                  ...overlapBox(overlap),
                }}
                onPointerEnter={(event) => placeBlockNote(event.currentTarget)}
                onFocusCapture={(event) => placeBlockNote(event.currentTarget)}
                onPointerDown={(event) => {
                  if (event.button !== 0 || (event.target as HTMLElement).closest("[data-no-drag]")) {
                    return;
                  }

                  movePlacedActivity(activity, event);
                }}
              >
                {first && days.length > 1 ? (
                  <span
                    className={`${styles.resizeHandle} ${styles.resizeLeft}`}
                    data-no-drag
                    onPointerDown={(event) => resizeActivityDays(activity, "start", event)}
                  />
                ) : null}
                {first ? (
                  <span
                    className={`${styles.resizeHandle} ${styles.resizeTop}`}
                    data-no-drag
                    onPointerDown={(event) => resizeActivity(activity, "start", event)}
                  />
                ) : null}
                <span className={styles.blockName} style={{ "--lines": endIndex - startIndex }}>
                  {activity.name}
                </span>
                {note ? <span className={styles.noteMark} aria-hidden="true" /> : null}
                {note ? (
                  <BlockNote
                    activity={activity}
                    dayIndex={slice.dayIndex}
                    onPlace={placeBlockNote}
                    onCommit={saveActivityNote}
                  />
                ) : null}
                <button
                  className={styles.blockDelete}
                  type="button"
                  data-no-drag
                  aria-label={`Remove ${activity.name}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => setPendingRemove(activity)}
                >
                  ×
                </button>
                {last ? (
                  <span
                    className={`${styles.resizeHandle} ${styles.resizeBottom}`}
                    data-no-drag
                    onPointerDown={(event) => resizeActivity(activity, "end", event)}
                  />
                ) : null}
                {last && days.length > 1 ? (
                  <span
                    className={`${styles.resizeHandle} ${styles.resizeRight}`}
                    data-no-drag
                    onPointerDown={(event) => resizeActivityDays(activity, "end", event)}
                  />
                ) : null}
              </div>
            );
          });
        })}
      </div>

      {editing ? (
        <ActivityEditDialog
          key={editing.id}
          itineraryId={itineraryId}
          activity={editing}
          categories={categories}
          stops={stops}
          openToken={editToken}
        />
      ) : null}

      <ActivityCreate
        itineraryId={itineraryId}
        categories={categories}
        stops={stops}
        dialogRef={createRef}
        slot={pendingCreate}
        onDismiss={() => {
          setPendingCreate(null);
          setDraft(null);
        }}
      />

      <dialog
        ref={confirmRef}
        className={dialogStyles.dialog}
        aria-labelledby="timeline-remove-title"
        onClose={() => setPendingRemove(null)}
        onKeyDown={closeDialogOnEscape}
      >
        <form className={dialogStyles.form} action={removePlacedActivity}>
          <div className={dialogStyles.header}>
            <p id="timeline-remove-title" className={dialogStyles.title}>
              Remove &ldquo;{pendingRemove?.name}&rdquo;?
            </p>
            <button
              className={dialogStyles.close}
              type="button"
              aria-label="Close"
              onClick={() => confirmRef.current?.close()}
            >
              ×
            </button>
          </div>
          <div className={dialogStyles.actions}>
            <button
              className="secondary"
              type="button"
              onClick={() => confirmRef.current?.close()}
            >
              No
            </button>
            <button className="primary" type="submit">
              Yes
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
