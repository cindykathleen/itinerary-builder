"use client";

import { useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import { COVER_MAX_BYTES } from "@/lib/cover-url";
import type { ItineraryListStatus } from "./ItinerariesSidebar";
import {
  archiveItinerary,
  deleteItinerary,
  permanentlyDeleteItinerary,
  renameItinerary,
  restoreItinerary,
  uploadItineraryCover,
} from "./actions";
import { closeDialogOnEscape } from "./dialog";
import styles from "./ItineraryCardMenu.module.css";
import dialogStyles from "./dialog.module.css";

type ConfirmAction = (formData: FormData) => void | Promise<void>;

export default function ItineraryCardMenu({
  id,
  name,
  photoUrl,
  status,
}: {
  id: string;
  name: string;
  photoUrl: string | null;
  status: ItineraryListStatus;
}) {
  const renameDialogRef = useRef<HTMLDialogElement>(null);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const pendingActionRef = useRef<ConfirmAction | null>(null);
  const [draftName, setDraftName] = useState(name);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [coverError, setCoverError] = useState("");
  const [coverPending, startCoverUpload] = useTransition();

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

  const chooseCover = () => {
    detailsRef.current?.removeAttribute("open");
    coverInputRef.current?.click();
  };

  const uploadCover = (file: File | undefined) => {
    if (!file) {
      return;
    }

    if (file.size > COVER_MAX_BYTES) {
      setCoverError("Cover images must be 5 MB or smaller.");
      return;
    }

    const formData = new FormData();
    formData.set("id", id);
    formData.set("file", file);
    startCoverUpload(async () => {
      const result = await uploadItineraryCover(formData);
      setCoverError(result?.error ?? "");
    });
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
      <div className={styles.menu}>
      <details ref={detailsRef}>
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
                  onClick={chooseCover}
                  disabled={coverPending}
                >
                  {photoUrl ? "Edit cover photo" : "Upload cover photo"}
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
        <input
          ref={coverInputRef}
          className={styles.coverFile}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={coverPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            uploadCover(file);
          }}
        />
      ) : null}
      {coverError ? (
        <p className={styles.coverError} role="alert">
          {coverError}
        </p>
      ) : null}
      </div>

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
