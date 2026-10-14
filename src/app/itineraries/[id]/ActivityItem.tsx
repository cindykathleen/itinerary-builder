"use client";

import { useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { useFormStatus } from "react-dom";
import { deleteActivity, updateActivity } from "../actions";
import { closeDialogOnEscape } from "../dialog";
import dialogStyles from "../dialog.module.css";
import CategorySelect, { type CategoryOption } from "./CategorySelect";
import styles from "./page.module.css";

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className="primary" type="submit" disabled={disabled || pending}>
      Save
    </button>
  );
}

export default function ActivityItem({
  itineraryId,
  id,
  name: activityName,
  note: activityNote,
  categoryId: activityCategoryId,
  scheduled,
  categories,
}: {
  itineraryId: string;
  id: string;
  name: string;
  note: string | null;
  categoryId: string | null;
  scheduled: boolean;
  categories: CategoryOption[];
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(activityName);
  const [note, setNote] = useState(activityNote ?? "");
  const [categoryId, setCategoryId] = useState(activityCategoryId ?? "");
  const canSubmit = name.trim() !== "";
  const nameId = `activity-edit-name-${id}`;
  const noteId = `activity-edit-note-${id}`;
  const categoryFieldId = `activity-edit-category-${id}`;
  const titleId = `activity-edit-title-${id}`;
  const confirmTitleId = `activity-delete-title-${id}`;

  const resetFields = () => {
    setName(activityName);
    setNote(activityNote ?? "");
    setCategoryId(activityCategoryId ?? "");
  };

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
    resetFields();
    dialogRef.current?.showModal();
  };

  const closeDialog = () => {
    dialogRef.current?.close();
  };

  const openDeleteConfirm = () => {
    closeMenu();
    confirmRef.current?.showModal();
  };

  const closeDeleteConfirm = () => {
    confirmRef.current?.close();
  };

  const guardSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    if (!canSubmit) {
      event.preventDefault();
    }
  };

  const save = async (formData: FormData) => {
    await updateActivity(formData);
    closeDialog();
  };

  const remove = async (formData: FormData) => {
    closeDeleteConfirm();
    await deleteActivity(formData);
  };

  return (
    <li className={scheduled ? `${styles.activity} ${styles.activityScheduled}` : styles.activity}>
      <div
        className={styles.activityBody}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", id);
          event.dataTransfer.effectAllowed = "move";
        }}
      >
        <h4>{activityName}</h4>
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

      <dialog
        ref={dialogRef}
        className={`${dialogStyles.dialog} ${dialogStyles.menuDialog}`}
        aria-labelledby={titleId}
        onClose={resetFields}
        onKeyDown={closeDialogOnEscape}
      >
        <form className={dialogStyles.form} action={save} onSubmit={guardSubmit}>
          <input type="hidden" name="itineraryId" value={itineraryId} />
          <input type="hidden" name="id" value={id} />

          <div className={dialogStyles.header}>
            <h2 id={titleId} className={dialogStyles.title}>
              Edit activity
            </h2>
            <button
              className={dialogStyles.close}
              type="button"
              aria-label="Close"
              onClick={closeDialog}
            >
              ×
            </button>
          </div>

          <div className={dialogStyles.body}>
            <div className={dialogStyles.field}>
              <label htmlFor={nameId}>
                Name <span className="required">*</span>
              </label>
              <input
                id={nameId}
                name="name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={255}
                required
              />
            </div>

            <div className={dialogStyles.field}>
              <label htmlFor={noteId}>Note</label>
              <textarea
                id={noteId}
                name="note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>

            <div className={dialogStyles.field}>
              <label htmlFor={categoryFieldId}>Category</label>
              <CategorySelect
                id={categoryFieldId}
                categories={categories}
                value={categoryId}
                onChange={setCategoryId}
              />
            </div>
          </div>

          <div className={dialogStyles.actions}>
            <button className="secondary" type="button" onClick={closeDialog}>
              Cancel
            </button>
            <SaveButton disabled={!canSubmit} />
          </div>
        </form>
      </dialog>

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
