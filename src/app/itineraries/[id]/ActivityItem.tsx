"use client";

import { useRef, useState } from "react";
import { deleteActivity } from "../actions";
import { closeDialogOnEscape } from "../dialog";
import dialogStyles from "../dialog.module.css";
import ActivityEditDialog from "./ActivityEditDialog";
import { useActivityHighlight } from "./ActivityHighlight";
import type { CategoryOption } from "./CategorySelect";
import type { StopOption } from "./StopSelect";
import styles from "./page.module.css";

function googleMapsHref(placeId: string, name: string | null) {
  const params = new URLSearchParams({
    api: "1",
    query: name?.trim() || "Google Maps",
    query_place_id: placeId,
  });

  return `https://www.google.com/maps/search/?${params.toString()}`;
}

export default function ActivityItem({
  itineraryId,
  id,
  name: activityName,
  note: activityNote,
  googlePlaceId,
  googlePlaceName,
  googlePlaceAddress,
  categoryId: activityCategoryId,
  stopId: activityStopId,
  scheduled,
  categories,
  stops,
}: {
  itineraryId: string;
  id: string;
  name: string;
  note: string | null;
  googlePlaceId: string | null;
  googlePlaceName: string | null;
  googlePlaceAddress: string | null;
  categoryId: string | null;
  stopId: string | null;
  scheduled: boolean;
  categories: CategoryOption[];
  stops: StopOption[];
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const [editToken, setEditToken] = useState(0);
  const highlight = useActivityHighlight();
  const confirmTitleId = `activity-delete-title-${id}`;

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

  const openDialog = () => {
    closeMenu();
    setEditToken((token) => token + 1);
  };

  const openDeleteConfirm = () => {
    closeMenu();
    confirmRef.current?.showModal();
  };

  const closeDeleteConfirm = () => {
    confirmRef.current?.close();
  };

  const remove = async (formData: FormData) => {
    closeDeleteConfirm();
    await deleteActivity(formData);
  };

  return (
    <li
      className={scheduled ? `${styles.activity} ${styles.activityScheduled}` : styles.activity}
      onMouseEnter={() => highlight?.setHoveredId(id)}
      onMouseLeave={() => highlight?.setHoveredId(null)}
    >
      <div
        className={styles.activityBody}
        draggable
        onDragStart={(event) => {
          if (event.target instanceof Element && event.target.closest("a")) {
            event.preventDefault();
            return;
          }

          event.dataTransfer.setData("text/plain", id);
          event.dataTransfer.effectAllowed = "move";
        }}
      >
        <div className={styles.activityTitle}>
          <h4>{activityName}</h4>
          {googlePlaceId ? (
            <span className={styles.googlePlace}>
              (<a
                href={googleMapsHref(googlePlaceId, googlePlaceName)}
                target="_blank"
                rel="noopener noreferrer"
                draggable={false}
              >
                Google Map
              </a>)
            </span>
          ) : null}
        </div>
        {activityNote ? <p>{activityNote}</p> : null}
      </div>
      <details ref={menuRef} className={styles.activityMenu} onToggle={placeDropdown}>
        <summary className={styles.activityMenuTrigger} aria-label={`Actions for ${activityName}`}>
          <span aria-hidden="true">⋮</span>
        </summary>
        <ul ref={dropdownRef} className={styles.activityMenuDropdown}>
          <li>
            <button className={styles.activityMenuAction} type="button" onClick={openDialog}>
              Edit
            </button>
          </li>
          <li>
            <button className={styles.activityMenuAction} type="button" onClick={openDeleteConfirm}>
              Delete
            </button>
          </li>
        </ul>
      </details>

      <ActivityEditDialog
        itineraryId={itineraryId}
        activity={{
          id,
          name: activityName,
          note: activityNote,
          googlePlaceId,
          googlePlaceName,
          googlePlaceAddress,
          categoryId: activityCategoryId,
          stopId: activityStopId,
          inSidebar: true,
        }}
        categories={categories}
        stops={stops}
        openToken={editToken}
      />

      <dialog
        ref={confirmRef}
        className={dialogStyles.dialog}
        aria-labelledby={confirmTitleId}
        onKeyDown={closeDialogOnEscape}
      >
        <form className={dialogStyles.form} action={remove}>
          <input type="hidden" name="itineraryId" value={itineraryId} />
          <input type="hidden" name="id" value={id} />

          <div className={dialogStyles.header}>
            <p id={confirmTitleId} className={dialogStyles.title}>
              Delete &ldquo;{activityName}&rdquo;?
            </p>
            <button
              className={dialogStyles.close}
              type="button"
              aria-label="Close"
              onClick={closeDeleteConfirm}
            >
              ×
            </button>
          </div>

          <div className={dialogStyles.actions}>
            <button className="secondary" type="button" onClick={closeDeleteConfirm}>
              No
            </button>
            <button className="primary" type="submit">
              Yes
            </button>
          </div>
        </form>
      </dialog>
    </li>
  );
}
