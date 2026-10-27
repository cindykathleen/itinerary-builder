"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject, SubmitEvent } from "react";
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
  startDate: string | null;
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
    .sort((left, right) => Number(left.startDate !== null) - Number(right.startDate !== null))
    .map((activity) => ({
      id: activity.id,
      name: activity.name,
      note: activity.note,
      scheduled: activity.startDate !== null,
      stopId: activity.stopId,
    }));
}

function StopTab({
  stop,
  selected,
  onSelect,
  onRename,
  onDelete,
}: {
  stop: StopOption;
  selected: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`${styles.stopTab} ${selected ? styles.stopTabSelected : ""}`}>
      <button
        className={styles.stop}
        type="button"
        role="tab"
        aria-selected={selected}
        onClick={onSelect}
      >
        {stop.name}
      </button>
      <PlaceActions name={stop.name} onRename={onRename} onDelete={onDelete} />
    </div>
  );
}

function PlaceActions({
  name,
  anchorRef,
  onRename,
  onDelete,
}: {
  name: string;
  anchorRef?: RefObject<HTMLElement | null>;
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

    const anchor = anchorRef?.current;
    const rect = (anchor ?? menu).getBoundingClientRect();
    dropdown.style.position = "fixed";
    dropdown.style.top = `${anchor ? rect.bottom : rect.bottom + 4}px`;
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

function PlaceBar({
  stops,
  selectedStopId,
  onSelect,
  onRename,
  onDelete,
}: {
  stops: StopOption[];
  selectedStopId: string | null;
  onSelect: (stopId: string | null) => void;
  onRename: (stop: StopOption) => void;
  onDelete: (stop: StopOption) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const selectedStop = stops.find((stop) => stop.id === selectedStopId) ?? null;

  useLayoutEffect(() => {
    const bar = barRef.current;
    const measure = measureRef.current;

    if (!bar || !measure) {
      return;
    }

    const update = () => {
      const labels = [...measure.children] as HTMLElement[];
      const count = labels.length;

      if (count === 0) {
        setOverflow(false);
        return;
      }

      const barStyle = getComputedStyle(bar);
      const padding = parseFloat(barStyle.paddingLeft) + parseFloat(barStyle.paddingRight);
      const gap = parseFloat(barStyle.columnGap || "0");
      const share = (bar.clientWidth - padding - gap * (count - 1)) / count;
      const widest = Math.max(...labels.map((label) => label.offsetWidth));

      setOverflow(widest > share + 1);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(bar);

    return () => observer.disconnect();
  }, [stops]);

  useEffect(() => {
    if (!overflow) {
      setMenuOpen(false);
    }
  }, [overflow]);

  useLayoutEffect(() => {
    if (!menuOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setMenuOpen(false);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const placeList = () => {
      const bar = barRef.current;
      const list = listRef.current;

      if (!bar || !list) {
        return;
      }

      const rect = bar.getBoundingClientRect();
      list.style.top = `${rect.bottom}px`;
      list.style.left = `${rect.left}px`;
      list.style.width = `${rect.width}px`;
    };

    placeList();
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", placeList);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", placeList);
    };
  }, [menuOpen]);

  const choose = (stopId: string | null) => {
    onSelect(stopId);
    setMenuOpen(false);
  };

  return (
    <div className={styles.stopsWrap}>
      <div ref={measureRef} className={styles.stopsMeasure} aria-hidden="true">
        <span>Logistics</span>
        {stops.map((stop) => (
          <span key={stop.id} className={styles.stopsMeasurePlace}>
            {stop.name}
          </span>
        ))}
      </div>
      <div
        ref={barRef}
        className={styles.stops}
        role={overflow ? undefined : "tablist"}
        aria-label="Places"
      >
        {overflow ? (
          <div ref={menuRef} className={styles.placeMenu}>
            <button
              className={styles.placeMenuTrigger}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className={styles.placeMenuLabel}>{selectedStop?.name ?? "Logistics"}</span>
              <span className={styles.placeMenuChevron} aria-hidden="true" />
            </button>
            {selectedStop ? (
              <PlaceActions
                name={selectedStop.name}
                anchorRef={barRef}
                onRename={() => onRename(selectedStop)}
                onDelete={() => onDelete(selectedStop)}
              />
            ) : null}
            {menuOpen ? (
              <ul ref={listRef} className={styles.placeMenuList} role="listbox">
                <li>
                  <button
                    className={styles.placeMenuOption}
                    type="button"
                    role="option"
                    aria-selected={selectedStopId === null}
                    onClick={() => choose(null)}
                  >
                    Logistics
                  </button>
                </li>
                {stops.map((stop) => (
                  <li key={stop.id}>
                    <button
                      className={styles.placeMenuOption}
                      type="button"
                      role="option"
                      aria-selected={selectedStopId === stop.id}
                      onClick={() => choose(stop.id)}
                    >
                      {stop.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <>
            <div
              className={`${styles.stopTab} ${
                selectedStopId === null && stops.length > 0 ? styles.stopTabSelected : ""
              }`}
            >
              <button
                className={styles.stop}
                type="button"
                role="tab"
                aria-selected={selectedStopId === null}
                onClick={() => onSelect(null)}
              >
                Logistics
              </button>
            </div>
            {stops.map((stop) => (
              <StopTab
                key={stop.id}
                stop={stop}
                selected={selectedStopId === stop.id}
                onSelect={() => onSelect(stop.id)}
                onRename={() => onRename(stop)}
                onDelete={() => onDelete(stop)}
              />
            ))}
          </>
        )}
      </div>
    </div>
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
  const [placeName, setPlaceName] = useState("");
  const [renameStop, setRenameStop] = useState<StopOption | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<StopOption | null>(null);
  const visible = activities.filter((activity) =>
    selectedStopId === null ? activity.stopId === null : activity.stopId === selectedStopId,
  );
  const tabCategories = categories.filter((category) =>
    selectedStopId === null ? category.stopId === null : category.stopId === selectedStopId,
  );
  const categoryIds = new Set(tabCategories.map((category) => category.id));
  const uncategorized = listedActivities(
    visible.filter(
      (activity) => activity.categoryId === null || !categoryIds.has(activity.categoryId),
    ),
  );

  useEffect(() => {
    if (selectedStopId && !stops.some((stop) => stop.id === selectedStopId)) {
      setSelectedStopId(stops[0]?.id ?? null);
    }
  }, [selectedStopId, stops]);

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
    <section className={`${styles.side} ${styles.activities}`} aria-label="Activities">
      <header className={styles.activitiesHeader}>
        <h2 className={styles.activitiesTitle}>Activities</h2>
        <ActivityAdd
          itineraryId={itineraryId}
          categories={categories}
          stops={stops}
          defaultStopId={selectedStopId}
          onNewPlace={openCreate}
        />
      </header>

      <PlaceBar
        stops={stops}
        selectedStopId={selectedStopId}
        onSelect={setSelectedStopId}
        onRename={(stop) => {
          setRenameName(stop.name);
          setRenameStop(stop);
        }}
        onDelete={setDeleteTarget}
      />

      {tabCategories.length > 0 || uncategorized.length > 0 ? (
        <ul className={styles.categoryList}>
          {tabCategories.map((category) => (
            <CategoryItem
              key={category.id}
              itineraryId={itineraryId}
              id={category.id}
              name={category.name}
              color={category.color}
              categories={categories}
              stops={stops}
              activities={listedActivities(
                visible.filter((activity) => activity.categoryId === category.id),
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
              categories={categories}
              stops={stops}
              activities={uncategorized}
            />
          ) : null}
        </ul>
      ) : null}

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
  );
}
