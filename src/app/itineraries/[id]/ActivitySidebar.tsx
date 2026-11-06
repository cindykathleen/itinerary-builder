"use client";

import { useEffect, useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { useFormStatus } from "react-dom";
import { createStop, deleteStop, updateStop } from "../actions";
import { closeDialogOnEscape } from "../dialog";
import dialogStyles from "../dialog.module.css";
import ActivityAdd from "./ActivityAdd";
import CategoryItem from "./CategoryItem";
import type { CategoryOption } from "./CategorySelect";
import type { StopOption } from "./StopSelect";
import styles from "./page.module.css";

type SidebarActivity = {
  id: string;
  name: string;
  note: string | null;
  categoryId: string | null;
  stopId: string | null;
  googlePlaceId: string | null;
  googlePlaceName: string | null;
  googlePlaceAddress: string | null;
  startDate: string | null;
  sidebarPosition: number | null;
};

function SubmitButton({ label, disabled }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className="primary" type="submit" disabled={disabled || pending}>
      {label}
    </button>
  );
}

function listedActivities(activities: SidebarActivity[]) {
  return [...activities]
    .sort((left, right) => {
      const group = Number(left.startDate !== null) - Number(right.startDate !== null);

      if (group !== 0) {
        return group;
      }

      return (left.sidebarPosition ?? 0) - (right.sidebarPosition ?? 0);
    })
    .map((activity) => ({
      id: activity.id,
      name: activity.name,
      note: activity.note,
      scheduled: activity.startDate !== null,
      stopId: activity.stopId,
      googlePlaceId: activity.googlePlaceId,
      googlePlaceName: activity.googlePlaceName,
      googlePlaceAddress: activity.googlePlaceAddress,
    }));
}

function PlaceActions({
  name,
  onRename,
  onDelete,
}: {
  name: string;
  onRename: () => void;
  onDelete: () => void;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  const closeMenu = () => {
    menuRef.current?.removeAttribute("open");
  };

  const placeDropdown = () => {
    const menu = menuRef.current;
    const dropdown = dropdownRef.current;

    if (!menu || !dropdown || !menu.open) {
      return;
    }

    const rect = menu.getBoundingClientRect();
    dropdown.style.position = "fixed";
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.right = `${window.innerWidth - rect.right}px`;
    dropdown.style.left = "auto";
  };

  return (
    <details ref={menuRef} className={styles.stopMenu} onToggle={placeDropdown}>
      <summary className={styles.stopMenuTrigger} aria-label={`Actions for ${name}`}>
        <span aria-hidden="true">⋮</span>
      </summary>
      <ul ref={dropdownRef} className={styles.stopMenuDropdown}>
        <li>
          <button
            className={styles.stopMenuAction}
            type="button"
            onClick={() => {
              closeMenu();
              onRename();
            }}
          >
            Rename
          </button>
        </li>
        <li>
          <button
            className={styles.stopMenuAction}
            type="button"
            onClick={() => {
              closeMenu();
              onDelete();
            }}
          >
            Delete
          </button>
        </li>
      </ul>
    </details>
  );
}

function PlaceSelect({
  stops,
  selectedStopId,
  onSelect,
  onRename,
  onDelete,
}: {
  stops: StopOption[];
  selectedStopId: string;
  onSelect: (stopId: string) => void;
  onRename: (stop: StopOption) => void;
  onDelete: (stop: StopOption) => void;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const selected = stops.find((stop) => stop.id === selectedStopId) ?? null;

  const choose = (stopId: string) => {
    onSelect(stopId);
    menuRef.current?.removeAttribute("open");
  };

  return (
    <details ref={menuRef} className={styles.placeSelect}>
      <summary className={styles.placeTrigger}>
        <span className={styles.placeTriggerLabel}>{selected?.name ?? ""}</span>
        <span className={styles.placeChevron} aria-hidden="true" />
      </summary>
      <ul className={styles.placeList} role="listbox">
        {stops.map((stop) => (
          <li key={stop.id} className={styles.placeOptionRow}>
            <button
              className={styles.placeOption}
              type="button"
              role="option"
              aria-selected={selectedStopId === stop.id}
              onClick={() => choose(stop.id)}
            >
              {stop.name}
            </button>
            <PlaceActions
              name={stop.name}
              onRename={() => onRename(stop)}
              onDelete={() => onDelete(stop)}
            />
          </li>
        ))}
      </ul>
    </details>
  );
}

function CategoryList({
  itineraryId,
  categories,
  allCategories,
  stops,
  activities,
}: {
  itineraryId: string;
  categories: CategoryOption[];
  allCategories: CategoryOption[];
  stops: StopOption[];
  activities: SidebarActivity[];
}) {
  const categoryIds = new Set(categories.map((category) => category.id));
  const uncategorized = listedActivities(
    activities.filter(
      (activity) => activity.categoryId === null || !categoryIds.has(activity.categoryId),
    ),
  );

  if (categories.length === 0 && uncategorized.length === 0) {
    return null;
  }

  return (
    <ul className={styles.categoryList}>
      {categories.map((category) => (
        <CategoryItem
          key={category.id}
          itineraryId={itineraryId}
          id={category.id}
          name={category.name}
          color={category.color}
          categories={allCategories}
          stops={stops}
          activities={listedActivities(
            activities.filter((activity) => activity.categoryId === category.id),
          )}
        />
      ))}
      {uncategorized.length > 0 ? (
        <CategoryItem
          key="uncategorized"
          itineraryId={itineraryId}
          id="uncategorized"
          name="Uncategorized"
          color="var(--surface)"
          readOnly
          categories={allCategories}
          stops={stops}
          activities={uncategorized}
        />
      ) : null}
    </ul>
  );
}

export default function ActivitySidebar({
  itineraryId,
  categories,
  stops,
  activities,
}: {
  itineraryId: string;
  categories: CategoryOption[];
  stops: StopOption[];
  activities: SidebarActivity[];
}) {
  const createRef = useRef<HTMLDialogElement>(null);
  const renameRef = useRef<HTMLDialogElement>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(stops[0]?.id ?? null);
  const activeStopId = stops.some((stop) => stop.id === selectedStopId)
    ? selectedStopId
    : (stops[0]?.id ?? null);
  const [placeName, setPlaceName] = useState("");
  const [renameStop, setRenameStop] = useState<StopOption | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<StopOption | null>(null);
  const logisticsCategories = categories.filter((category) => category.stopId === null);
  const logisticsActivities = activities.filter((activity) => activity.stopId === null);
  const placeCategories = categories.filter(
    (category) => activeStopId !== null && category.stopId === activeStopId,
  );
  const placeActivities = activities.filter(
    (activity) => activeStopId !== null && activity.stopId === activeStopId,
  );

  useEffect(() => {
    if (renameStop && renameRef.current && !renameRef.current.open) {
      renameRef.current.showModal();
    }
  }, [renameStop]);

  useEffect(() => {
    if (deleteTarget && deleteRef.current && !deleteRef.current.open) {
      deleteRef.current.showModal();
    }
  }, [deleteTarget]);

  const openCreate = () => {
    setPlaceName("");
    createRef.current?.showModal();
  };

  const guardName = (event: SubmitEvent<HTMLFormElement>, name: string) => {
    if (name.trim() === "") {
      event.preventDefault();
    }
  };

  return (
    <div className={styles.column}>
    <section className={`${styles.side} ${styles.logistics}`} aria-label="Logistics">
      <header className={styles.activitiesHeader}>
        <h2 className={styles.activitiesTitle}>Logistics</h2>
        <ActivityAdd
          itineraryId={itineraryId}
          categories={categories}
          stops={stops}
          defaultStopId={null}
        />
      </header>
      <CategoryList
        itineraryId={itineraryId}
        categories={logisticsCategories}
        allCategories={categories}
        stops={stops}
        activities={logisticsActivities}
      />
    </section>
    <section className={`${styles.side} ${styles.activities}`} aria-label="Activities">
      <header className={styles.activitiesHeader}>
        <div className={styles.activitiesHeading}>
          <h2 className={styles.activitiesTitle}>Activities</h2>
          {activeStopId ? (
            <PlaceSelect
              stops={stops}
              selectedStopId={activeStopId}
              onSelect={setSelectedStopId}
              onRename={(stop) => {
                setRenameName(stop.name);
                setRenameStop(stop);
              }}
              onDelete={setDeleteTarget}
            />
          ) : null}
        </div>
        <ActivityAdd
          itineraryId={itineraryId}
          categories={categories}
          stops={stops}
          defaultStopId={activeStopId}
          onNewPlace={openCreate}
        />
      </header>
      <CategoryList
        itineraryId={itineraryId}
        categories={placeCategories}
        allCategories={categories}
        stops={stops}
        activities={placeActivities}
      />

      <dialog
        ref={createRef}
        className={dialogStyles.dialog}
        aria-labelledby="place-create-title"
        onClose={() => setPlaceName("")}
        onKeyDown={closeDialogOnEscape}
      >
        <form
          className={dialogStyles.form}
          action={async (formData) => {
            await createStop(formData);
            createRef.current?.close();
          }}
          onSubmit={(event) => guardName(event, placeName)}
        >
          <input type="hidden" name="itineraryId" value={itineraryId} />
          <div className={dialogStyles.header}>
            <h2 id="place-create-title" className={dialogStyles.title}>
              New place
            </h2>
            <button
              className={dialogStyles.close}
              type="button"
              aria-label="Close"
              onClick={() => createRef.current?.close()}
            >
              ×
            </button>
          </div>
          <div className={dialogStyles.body}>
            <div className={dialogStyles.field}>
              <label htmlFor="place-create-name">
                Name <span className="required">*</span>
              </label>
              <input
                id="place-create-name"
                name="name"
                type="text"
                value={placeName}
                onChange={(event) => setPlaceName(event.target.value)}
                maxLength={255}
                required
              />
            </div>
          </div>
          <div className={dialogStyles.actions}>
            <button className="secondary" type="button" onClick={() => createRef.current?.close()}>
              Cancel
            </button>
            <SubmitButton label="Create" disabled={placeName.trim() === ""} />
          </div>
        </form>
      </dialog>

      <dialog
        ref={renameRef}
        className={dialogStyles.dialog}
        aria-labelledby="place-rename-title"
        onClose={() => setRenameStop(null)}
        onKeyDown={closeDialogOnEscape}
      >
        <form
          className={dialogStyles.form}
          action={async (formData) => {
            await updateStop(formData);
            renameRef.current?.close();
          }}
          onSubmit={(event) => guardName(event, renameName)}
        >
          <input type="hidden" name="itineraryId" value={itineraryId} />
          <input type="hidden" name="id" value={renameStop?.id ?? ""} />
          <div className={dialogStyles.header}>
            <h2 id="place-rename-title" className={dialogStyles.title}>
              Rename place
            </h2>
            <button
              className={dialogStyles.close}
              type="button"
              aria-label="Close"
              onClick={() => renameRef.current?.close()}
            >
              ×
            </button>
          </div>
          <div className={dialogStyles.body}>
            <div className={dialogStyles.field}>
              <label htmlFor="place-rename-name">
                Name <span className="required">*</span>
              </label>
              <input
                id="place-rename-name"
                name="name"
                type="text"
                value={renameName}
                onChange={(event) => setRenameName(event.target.value)}
                maxLength={255}
                required
              />
            </div>
          </div>
          <div className={dialogStyles.actions}>
            <button className="secondary" type="button" onClick={() => renameRef.current?.close()}>
              Cancel
            </button>
            <SubmitButton label="Save" disabled={renameName.trim() === ""} />
          </div>
        </form>
      </dialog>

      <dialog
        ref={deleteRef}
        className={dialogStyles.dialog}
        aria-labelledby="place-delete-title"
        onClose={() => setDeleteTarget(null)}
        onKeyDown={closeDialogOnEscape}
      >
        <form
          className={dialogStyles.form}
          action={async (formData) => {
            await deleteStop(formData);
            deleteRef.current?.close();
          }}
        >
          <input type="hidden" name="itineraryId" value={itineraryId} />
          <input type="hidden" name="id" value={deleteTarget?.id ?? ""} />
          <div className={dialogStyles.header}>
            <p id="place-delete-title" className={dialogStyles.title}>
              Delete &ldquo;{deleteTarget?.name}&rdquo;?
            </p>
            <button
              className={dialogStyles.close}
              type="button"
              aria-label="Close"
              onClick={() => deleteRef.current?.close()}
            >
              ×
            </button>
          </div>
          <div className={dialogStyles.actions}>
            <button className="secondary" type="button" onClick={() => deleteRef.current?.close()}>
              No
            </button>
            <SubmitButton label="Yes" />
          </div>
        </form>
      </dialog>
    </section>
    </div>
  );
}
