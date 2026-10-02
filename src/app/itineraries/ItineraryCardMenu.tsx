"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { ItineraryListStatus } from "./ItinerariesSidebar";
import {
  archiveItinerary,
  deleteItinerary,
  permanentlyDeleteItinerary,
  renameItinerary,
  restoreItinerary,
} from "./actions";
import { closeDialogOnEscape } from "./dialog";
import styles from "./ItineraryCardMenu.module.css";
import dialogStyles from "./dialog.module.css";

type ConfirmAction = (formData: FormData) => void | Promise<void>;

export default function ItineraryCardMenu({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: ItineraryListStatus;
}) {
  const renameDialogRef = useRef<HTMLDialogElement>(null);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const pendingActionRef = useRef<ConfirmAction | null>(null);
  const [draftName, setDraftName] = useState(name);
  const [confirmMessage, setConfirmMessage] = useState("");

  const openRenameDialog = () => {
    setDraftName(name);
    detailsRef.current?.removeAttribute("open");
    renameDialogRef.current?.showModal();
  };

  const closeRenameDialog = () => {
    renameDialogRef.current?.close();
  };

  const openConfirm = (message: string, action: ConfirmAction) => {
    pendingActionRef.current = action;
    detailsRef.current?.removeAttribute("open");
    flushSync(() => {
      setConfirmMessage(message);
    });
    const dialog = confirmDialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  };

  const closeConfirm = () => {
    confirmDialogRef.current?.close();
  };

  const saveRename = async (formData: FormData) => {
    await renameItinerary(formData);
    closeRenameDialog();
  };

  const submitConfirm = async (formData: FormData) => {
    const action = pendingActionRef.current;
    closeConfirm();
    if (action) {
      await action(formData);
    }
  };

  return (
    <>
      <details ref={detailsRef} className={styles.menu}>
        <summary className={styles.trigger} aria-label={`Actions for ${name}`}>
          <span aria-hidden="true">⋮</span>
        </summary>
        <ul className={styles.dropdown}>
          {status === "active" ? (
            <>
              <li>
                <button
                  className={styles.action}
                  type="button"
                  onClick={openRenameDialog}
                >
                  Rename
                </button>
              </li>
              <li>
                <button
                  className={styles.action}
                  type="button"
                  onClick={() =>
                    openConfirm(`Archive "${name}"?`, archiveItinerary)
                  }
                >
                  Archive
                </button>
              </li>
              <li>
                <button
                  className={styles.action}
                  type="button"
                  onClick={() =>
                    openConfirm(`Delete "${name}"?`, deleteItinerary)
                  }
                >
                  Delete
                </button>
              </li>
            </>
          ) : null}

          {status === "archived" ? (
            <>
              <li>
                <button
                  className={styles.action}
                  type="button"
                  onClick={() =>
                    openConfirm(`Restore "${name}"?`, restoreItinerary)
                  }
                >
                  Restore
                </button>
              </li>
              <li>
                <button
                  className={styles.action}
                  type="button"
                  onClick={() =>
                    openConfirm(`Delete "${name}"?`, deleteItinerary)
                  }
                >
                  Delete
                </button>
              </li>
            </>
          ) : null}

          {status === "trashed" ? (
            <>
              <li>
                <button
                  className={styles.action}
                  type="button"
                  onClick={() =>
                    openConfirm(`Restore "${name}"?`, restoreItinerary)
                  }
                >
                  Restore
                </button>
              </li>
              <li>
                <button
                  className={styles.action}
                  type="button"
                  onClick={() =>
                    openConfirm(
                      `Permanently delete "${name}"? This cannot be undone.`,
                      permanentlyDeleteItinerary,
                    )
                  }
                >
                  Delete permanently
                </button>
              </li>
            </>
          ) : null}
        </ul>
      </details>

      {status === "active" ? (
        <dialog
          ref={renameDialogRef}
          className={dialogStyles.dialog}
          aria-labelledby={`rename-title-${id}`}
          onKeyDown={closeDialogOnEscape}
        >
          <form className={dialogStyles.form} action={saveRename}>
            <div className={dialogStyles.header}>
              <h2 id={`rename-title-${id}`} className={dialogStyles.title}>
                Rename itinerary
              </h2>
              <button
                className={dialogStyles.close}
                type="button"
                aria-label="Close"
                onClick={closeRenameDialog}
              >
                ×
              </button>
            </div>

            <div className={dialogStyles.body}>
              <input type="hidden" name="id" value={id} />
              <div className={dialogStyles.field}>
                <label htmlFor={`rename-${id}`}>Name</label>
                <input
                  id={`rename-${id}`}
                  name="name"
                  type="text"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  maxLength={255}
                  required
                />
              </div>
            </div>

            <div className={dialogStyles.actions}>
              <button
                className="secondary"
                type="button"
                onClick={closeRenameDialog}
              >
                Cancel
              </button>
              <button className="primary" type="submit">
                Save
              </button>
            </div>
          </form>
        </dialog>
      ) : null}

      <dialog
        ref={confirmDialogRef}
        className={dialogStyles.dialog}
        aria-labelledby={`confirm-title-${id}`}
        onKeyDown={closeDialogOnEscape}
        onClose={() => {
          pendingActionRef.current = null;
          setConfirmMessage("");
        }}
      >
        <form className={dialogStyles.form} action={submitConfirm}>
          <div className={dialogStyles.header}>
            <p id={`confirm-title-${id}`} className={dialogStyles.title}>
              {confirmMessage}
            </p>
            <button
              className={dialogStyles.close}
              type="button"
              aria-label="Close"
              onClick={closeConfirm}
            >
              ×
            </button>
          </div>

          <input type="hidden" name="id" value={id} />

          <div className={dialogStyles.actions}>
            <button
              className="secondary"
              type="button"
              onClick={closeConfirm}
            >
              No
            </button>
            <button className="primary" type="submit">
              Yes
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
