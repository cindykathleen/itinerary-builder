"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { moveSectionActivity, sectionDropIndex } from "@/lib/section-placement";
import { listDays } from "@/lib/timeline";
import { placeActivityInSection, unscheduleActivity } from "../actions";
import { closeDialogOnEscape } from "../dialog";
import dialogStyles from "../dialog.module.css";
import ActivityCreate, { type ActivitySlot } from "./ActivityCreate";
import ActivityEditDialog, { type EditableActivity } from "./ActivityEditDialog";
import { useActivityHighlight } from "./ActivityHighlight";
import { categoryTextColor } from "./CategoryItem";
import type { CategoryOption } from "./CategorySelect";
import DayHeader from "./DayHeader";
import timelineStyles from "./ItineraryTimeline.module.css";
import styles from "./ItinerarySections.module.css";
import type { StopOption } from "./StopSelect";

type SectionActivity = {
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
  sectionId: string | null;
  sectionDate: string | null;
  position: number | null;
};

type SectionOption = {
  id: string;
  name: string;
  position: number;
};

type DropTarget = {
  sectionId: string;
  date: string;
  beforeId: string | null;
};

function activityKey(activity: SectionActivity) {
  return [
    activity.id,
    activity.sectionId ?? "",
    activity.sectionDate ?? "",
    activity.position ?? "",
    activity.inSidebar ? "1" : "0",
    activity.name,
    activity.note ?? "",
    activity.categoryId ?? "",
    activity.stopId ?? "",
    activity.googlePlaceId ?? "",
    activity.color,
  ].join("\u001f");
}

function hasDragType(dataTransfer: DataTransfer, type: string) {
  return Array.from(dataTransfer.types).includes(type);
}

export default function ItinerarySections({
  itineraryId,
  dateStart,
  dateEnd,
  daySettings,
  sections,
  activities,
  categories,
  stops,
}: {
  itineraryId: string;
  dateStart: string;
  dateEnd: string;
  daySettings: { date: string; heading: string | null }[];
  sections: SectionOption[];
  activities: SectionActivity[];
  categories: CategoryOption[];
  stops: StopOption[];
}) {
  const days = listDays(dateStart, dateEnd);
  const headings = new Map(daySettings.map((day) => [day.date, day.heading?.trim() ?? ""]));
  const orderedSections = [...sections].sort((left, right) => left.position - right.position);
  const boardRef = useRef<HTMLElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const createRef = useRef<HTMLDialogElement>(null);
  const addUnscheduledRef = useRef<(id: string) => void>(() => {});
  const draggedClick = useRef(false);
  const [items, setItems] = useState(activities);
  const [orderKey, setOrderKey] = useState(activities.map(activityKey).join("|"));
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [pendingRemove, setPendingRemove] = useState<SectionActivity | null>(null);
  const [pendingCreate, setPendingCreate] = useState<ActivitySlot | null>(null);
  const [editing, setEditing] = useState<EditableActivity | null>(null);
  const [editToken, setEditToken] = useState(0);
  const nextOrderKey = activities.map(activityKey).join("|");
  const highlight = useActivityHighlight();

  if (nextOrderKey !== orderKey) {
    setOrderKey(nextOrderKey);
    setItems(activities);
  }

  const stopName = (stopId: string | null) =>
    stops.find((stop) => stop.id === stopId)?.name ?? "";

  const cellItems = (sectionId: string, date: string) =>
    items
      .filter((activity) => activity.sectionId === sectionId && activity.sectionDate === date)
      .sort((left, right) => (left.position ?? 0) - (right.position ?? 0) || left.name.localeCompare(right.name));

  const moveActivity = async (
    id: string,
    sectionId: string,
    date: string,
    beforeId: string | null,
  ) => {
    const activity = items.find((item) => item.id === id);
    const position = sectionDropIndex(
      cellItems(sectionId, date).map((item) => item.id),
      id,
      beforeId,
    );

    if (!activity) {
      return;
    }

    const currentIndex = cellItems(sectionId, date).findIndex((item) => item.id === id);

    if (activity.sectionId === sectionId && activity.sectionDate === date && currentIndex === position) {
      return;
    }

    const previous = items;
    setItems(
      moveSectionActivity(items, {
        id,
        sectionId,
        sectionDate: date,
        position,
      }).map((item) => (item.id === id ? { ...item, inSidebar: false } : item)),
    );
    setDropTarget(null);

    try {
      await placeActivityInSection({ itineraryId, id, date, sectionId, position });
    } catch {
      setItems(previous);
    }
  };

  useLayoutEffect(() => {
    addUnscheduledRef.current = (id: string) => {
      const activity = items.find((item) => item.id === id);
      const section = orderedSections[0];
      const day = days[0];

      if (!activity || activity.sectionId || !section || !day) {
        return;
      }

      void moveActivity(id, section.id, day.iso, null);
    };
  });

  useEffect(() => {
    const stopDragging = () => setDropTarget(null);
    const addToItinerary = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;

      if (id) {
        addUnscheduledRef.current(id);
      }
    };
    window.addEventListener("dragend", stopDragging);
    window.addEventListener("activity-add-to-itinerary", addToItinerary);
    return () => {
      window.removeEventListener("dragend", stopDragging);
      window.removeEventListener("activity-add-to-itinerary", addToItinerary);
    };
  }, []);

  useEffect(() => {
    if (!highlight?.hoveredId || highlight.source === "timeline") {
      return;
    }

    boardRef.current
      ?.querySelector(`[data-activity-id="${CSS.escape(highlight.hoveredId)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [highlight?.hoveredId, highlight?.source]);

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

  const allowDrop = (event: DragEvent<HTMLElement>) => {
    if (!hasDragType(event.dataTransfer, "text/plain")) {
      return false;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    return true;
  };

  const editActivity = (activity: SectionActivity) => {
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

  const removePlacedActivity = async () => {
    const activity = pendingRemove;

    if (!activity) {
      return;
    }

    const previous = items;
    confirmRef.current?.close();
    setItems((current) =>
      current.map((item) =>
        item.id === activity.id
          ? { ...item, sectionId: null, sectionDate: null, position: null, inSidebar: true }
          : item,
      ),
    );

    try {
      await unscheduleActivity({ itineraryId, id: activity.id });
    } catch {
      setItems(previous);
    }
  };

  return (
    <section ref={boardRef} className={styles.board} aria-label="Sections">
      <div
        className={styles.grid}
        style={{
          gridTemplateColumns: `120px repeat(${days.length}, minmax(160px, 1fr))`,
          minWidth: `calc(120px + ${days.length} * 160px)`,
        }}
      >
        <div className={styles.corner} />
        {days.map((day, column) => (
          <div
            key={day.iso}
            className={timelineStyles.day}
            style={{ gridColumn: column + 2, gridRow: 1 }}
          >
            <DayHeader
              itineraryId={itineraryId}
              date={day.iso}
              label={day.label}
              heading={headings.get(day.iso) ?? ""}
            />
            <div className={timelineStyles.date}>{day.label}</div>
          </div>
        ))}
        {orderedSections.map((section, row) => (
          <div key={section.id} style={{ display: "contents" }}>
            <div className={styles.sectionName} style={{ gridColumn: 1, gridRow: row + 2 }}>
              {section.name}
            </div>
            {days.map((day, column) => {
              const placed = cellItems(section.id, day.iso);
              const cellTarget =
                dropTarget?.sectionId === section.id && dropTarget.date === day.iso;

              return (
                <div
                  key={`${section.id}-${day.iso}`}
                  className={[styles.cell, cellTarget ? styles.cellOver : ""].filter(Boolean).join(" ")}
                  data-date={day.iso}
                  data-section={section.name}
                  style={{ gridColumn: column + 2, gridRow: row + 2 }}
                  onClick={() =>
                    setPendingCreate({
                      date: day.iso,
                      startTime: "",
                      endTime: "",
                      sectionId: section.id,
                      label: `${day.label}, ${section.name}`,
                    })
                  }
                  onDragOver={(event) => {
                    if (!allowDrop(event)) {
                      return;
                    }

                    setDropTarget({ sectionId: section.id, date: day.iso, beforeId: null });
                  }}
                  onDrop={(event) => {
                    if (!allowDrop(event)) {
                      return;
                    }

                    const id = event.dataTransfer.getData("text/plain");
                    void moveActivity(id, section.id, day.iso, dropTarget?.beforeId ?? null);
                  }}
                >
                  {placed.map((activity) => {
                    const note = activity.note?.trim() ?? "";
                    const place = activity.googlePlaceName?.trim() ?? "";
                    const stop = stopName(activity.stopId);
                    const highlighted =
                      highlight?.hoveredId === activity.id ||
                      (highlight?.hoveredPlaceId !== null &&
                        activity.googlePlaceId === highlight?.hoveredPlaceId);

                    return (
                      <article
                        key={activity.id}
                        data-activity-id={activity.id}
                        className={[
                          styles.card,
                          cellTarget && dropTarget?.beforeId === activity.id ? styles.cardDropBefore : "",
                          highlighted ? styles.cardHighlighted : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={{
                          backgroundColor: activity.color,
                          color: categoryTextColor(activity.color) ?? "var(--text-primary)",
                        }}
                        draggable
                        onClick={(event) => {
                          event.stopPropagation();

                          if (draggedClick.current) {
                            return;
                          }

                          editActivity(activity);
                        }}
                        onDragStart={(event) => {
                          draggedClick.current = true;
                          event.dataTransfer.setData("text/plain", activity.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.stopPropagation();
                        }}
                        onDragEnd={() => {
                          window.setTimeout(() => {
                            draggedClick.current = false;
                          }, 0);
                        }}
                        onDragOver={(event) => {
                          if (!allowDrop(event)) {
                            return;
                          }

                          event.stopPropagation();
                          const rect = event.currentTarget.getBoundingClientRect();
                          const before = event.clientY < rect.top + rect.height / 2;
                          const index = placed.findIndex((item) => item.id === activity.id);
                          const beforeId = before ? activity.id : placed[index + 1]?.id ?? null;
                          setDropTarget({ sectionId: section.id, date: day.iso, beforeId });
                        }}
                        onDrop={(event) => {
                          if (!allowDrop(event)) {
                            return;
                          }

                          event.stopPropagation();
                          const id = event.dataTransfer.getData("text/plain");
                          const rect = event.currentTarget.getBoundingClientRect();
                          const before = event.clientY < rect.top + rect.height / 2;
                          const index = placed.findIndex((item) => item.id === activity.id);
                          const beforeId = before ? activity.id : placed[index + 1]?.id ?? null;
                          void moveActivity(id, section.id, day.iso, beforeId);
                        }}
                      >
                        <span className={styles.cardName}>{activity.name}</span>
                        {stop ? <span className={styles.cardMeta}>{stop}</span> : null}
                        {place ? <span className={styles.cardMeta}>{place}</span> : null}
                        {note ? <span className={styles.cardNote}>{note}</span> : null}
                        <button
                          className={styles.remove}
                          type="button"
                          aria-label={`Remove ${activity.name}`}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingRemove(activity);
                          }}
                        >
                          ×
                        </button>
                      </article>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {editing ? (
        <ActivityEditDialog
          key={editing.id}
          itineraryId={itineraryId}
          activity={editing}
          categories={categories}
          stops={stops}
          openToken={editToken}
          placedInSection
        />
      ) : null}

      <ActivityCreate
        itineraryId={itineraryId}
        categories={categories}
        stops={stops}
        dialogRef={createRef}
        slot={pendingCreate}
        onDismiss={() => setPendingCreate(null)}
      />

      <dialog
        ref={confirmRef}
        className={dialogStyles.dialog}
        aria-labelledby="section-remove-title"
        onClose={() => setPendingRemove(null)}
        onKeyDown={closeDialogOnEscape}
      >
        <form className={dialogStyles.form} action={removePlacedActivity}>
          <div className={dialogStyles.header}>
            <p id="section-remove-title" className={dialogStyles.title}>
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
            <button className="secondary" type="button" onClick={() => confirmRef.current?.close()}>
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
