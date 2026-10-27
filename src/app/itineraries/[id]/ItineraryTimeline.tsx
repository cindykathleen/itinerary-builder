"use client";

import { useEffect, useRef, useState } from "react";
import type { DragEvent, PointerEvent as ReactPointerEvent } from "react";
import { deleteActivity, scheduleActivity, unscheduleActivity } from "../actions";
import { closeDialogOnEscape } from "../dialog";
import dialogStyles from "../dialog.module.css";
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hasDragType(dataTransfer: DataTransfer, type: string) {
  return Array.from(dataTransfer.types).includes(type);
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

function scheduledRange(
  activity: TimelineActivity,
  date: string,
  startTime: string,
  dayEnd: string,
  timeInterval: number,
) {
  const startMinutes = toMinutes(startTime);
  const dayEndMinutes = toMinutes(dayEnd);

  if (startMinutes === null || dayEndMinutes === null || startMinutes > dayEndMinutes) {
    return null;
  }

  const currentStart = activity.startTime ? toMinutes(activity.startTime) : null;
  const currentEnd = activity.endTime ? toMinutes(activity.endTime) : null;
  const duration =
    currentStart !== null && currentEnd !== null && currentEnd > currentStart
      ? currentEnd - currentStart
      : timeInterval;
  const endMinutes = Math.min(startMinutes + duration, dayEndMinutes + timeInterval);

  if (endMinutes <= startMinutes) {
    return null;
  }

  return { date, startTime, endTime: minutesToTime(endMinutes) };
}

function placementConflicts(
  activities: TimelineActivity[],
  id: string,
  placement: { date: string; startTime: string; endTime: string },
) {
  const start = toMinutes(placement.startTime);
  const end = toMinutes(placement.endTime);

  if (start === null || end === null) {
    return true;
  }

  return activities.some((activity) => {
    if (
      activity.id === id ||
      activity.startDate !== placement.date ||
      !activity.startTime ||
      !activity.endTime
    ) {
      return false;
    }

    const otherStart = toMinutes(activity.startTime);
    const otherEnd = toMinutes(activity.endTime);

    if (otherStart === null || otherEnd === null) {
      return false;
    }

    return start < otherEnd && end > otherStart;
  });
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
  const [overKey, setOverKey] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropBlocked, setDropBlocked] = useState(false);
  const [movePreview, setMovePreview] = useState<{
    id: string;
    date: string;
    startTime: string;
    endTime: string;
  } | null>(null);
  const [pendingRemove, setPendingRemove] = useState<TimelineActivity | null>(null);
  const [pendingCreate, setPendingCreate] = useState<ActivitySlot | null>(null);
  const [draft, setDraft] = useState<{ date: string; startIndex: number; endIndex: number } | null>(null);
  const highlight = useActivityHighlight();
  const hoveredId = highlight?.hoveredId ?? null;

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
      setOverKey(null);
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

  const slotTaken = (date: string, minutes: number) => {
    const finish = minutes + timeInterval;

    return items.some((activity) => {
      if (activity.startDate !== date || !activity.startTime || !activity.endTime) {
        return false;
      }

      const start = toMinutes(activity.startTime);
      const end = toMinutes(activity.endTime);

      if (start === null || end === null) {
        return false;
      }

      return minutes < end && finish > start;
    });
  };

  const selectionRange = (date: string, anchorIndex: number, pointerIndex: number) => {
    if (pointerIndex >= anchorIndex) {
      let far = anchorIndex;

      for (let index = anchorIndex; index <= pointerIndex; index += 1) {
        if (slotTaken(date, slots[index])) {
          break;
        }

        far = index;
      }

      return { startIndex: anchorIndex, endIndex: far + 1 };
    }

    let far = anchorIndex;

    for (let index = anchorIndex; index >= pointerIndex; index -= 1) {
      if (slotTaken(date, slots[index])) {
        break;
      }

      far = index;
    }

    return { startIndex: far, endIndex: anchorIndex + 1 };
  };

  const beginCreate = (event: ReactPointerEvent<HTMLDivElement>, day: TimelineDay, minutes: number) => {
    if (event.button !== 0 || slotTaken(day.iso, minutes)) {
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

      selection = selectionRange(day.iso, anchorIndex, slotIndexAt(pointerEvent.clientY));
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
      ? scheduledRange(activity, date, startTime, dayEnd, timeInterval)
      : null;

    return placement !== null && !placementConflicts(items, id, placement);
  };

  const placeActivity = async (id: string, date: string, startTime: string) => {
    const current = items.find((activity) => activity.id === id);
    const placement = current ? scheduledRange(current, date, startTime, dayEnd, timeInterval) : null;

    if (!current || !placement || placementConflicts(items, id, placement)) {
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
      );

      if (!placement || placementConflicts(items, activity.id, placement)) {
        next = null;
        setOverKey(null);
        setMovePreview(null);
        setDropBlocked(true);
        return;
      }

      next = placement;
      setDropBlocked(false);
      setOverKey(`${placement.date}|${toMinutes(placement.startTime)}`);
      setMovePreview({ id: activity.id, ...placement });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      timelineRef.current?.classList.remove(styles.dragging);
      setDragging(false);
      setDropBlocked(false);
      setOverKey(null);
      setMovePreview(null);

      if (!moved || !next) {
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

    const startIndex = activity.startTime ? slots.indexOf(toMinutes(activity.startTime) ?? -1) : -1;
    let endIndex = boundaryIndex(activity.endTime, slots);

    if (endIndex <= startIndex) {
      endIndex = Math.min(slots.length, startIndex + 1);
    }

    if (startIndex < 0 || endIndex <= startIndex || !activity.startDate) {
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
        nextEnd = clamp(originEnd + delta, originStart + 1, slots.length);
      } else {
        nextStart = clamp(originStart + delta, 0, originEnd - 1);
        nextEnd = originEnd;
      }

      const startTime = minutesToTime(slots[nextStart]);
      const endTime = minutesToTime(boundaryMinutes(nextEnd));
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
      const endTime = minutesToTime(boundaryMinutes(nextEnd));
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
          gridTemplateColumns: `96px repeat(${days.length}, minmax(148px, 1fr))`,
          gridTemplateRows: `auto repeat(${slots.length}, 36px)`,
        }}
      >
        <div className={styles.corner}>
          <span className={styles.srOnly}>Time</span>
        </div>
        {days.map((day, column) => (
          <div key={day.iso} className={styles.day} style={{ gridColumn: column + 2, gridRow: 1 }}>
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
            className={styles.time}
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
                  overKey === key ? styles.cellOver : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ gridColumn: column + 2, gridRow: row + 2 }}
                data-date={canDrop ? day.iso : undefined}
                data-minutes={canDrop ? minutes : undefined}
                onPointerDown={canDrop ? (event) => beginCreate(event, day, minutes) : undefined}
                onDragEnter={
                  canDrop
                    ? (event) => {
                        const id = draggedIdRef.current;

                        if (!id || !hasDragType(event.dataTransfer, "text/plain") || !canPlace(id, day.iso, minutesToTime(minutes))) {
                          setOverKey(null);
                          setDropBlocked(true);
                          return;
                        }

                        setDropBlocked(false);
                        setOverKey(key);
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

                        setOverKey((currentKey) => (currentKey === key ? null : currentKey));
                      }
                    : undefined
                }
                onDrop={
                  canDrop
                    ? (event) => {
                        event.preventDefault();
                        setOverKey(null);
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

          const column = days.findIndex((day) => day.iso === shown.startDate);
          const startMinutes = toMinutes(shown.startTime);
          const startIndex = startMinutes === null ? -1 : slots.indexOf(startMinutes);
          let endIndex = boundaryIndex(shown.endTime, slots);

          if (endIndex <= startIndex) {
            endIndex = Math.min(slots.length, startIndex + 1);
          }

          if (column < 0 || startIndex < 0 || endIndex <= startIndex) {
            return null;
          }

          return (
            <div
              key={activity.id}
              data-activity-id={activity.id}
              className={[
                styles.block,
                movePreview?.id === activity.id ? styles.blockMoving : "",
                hoveredId === activity.id ? styles.blockHighlighted : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label={activity.name}
              style={{
                gridColumn: column + 2,
                gridRow: `${startIndex + 2} / ${endIndex + 2}`,
                backgroundColor: activity.color,
                color: categoryTextColor(activity.color) ?? "var(--text-primary)",
              }}
              onPointerDown={(event) => movePlacedActivity(activity, event)}
            >
              <span
                className={`${styles.resizeHandle} ${styles.resizeTop}`}
                data-no-drag
                onPointerDown={(event) => resizeActivity(activity, "start", event)}
              />
              <span className={styles.blockName} style={{ "--lines": endIndex - startIndex }}>
                {activity.name}
              </span>
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
              <span
                className={`${styles.resizeHandle} ${styles.resizeBottom}`}
                data-no-drag
                onPointerDown={(event) => resizeActivity(activity, "end", event)}
              />
            </div>
          );
        })}
      </div>

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
