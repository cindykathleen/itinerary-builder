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
      <details ref={detailsRef}>
        <summary aria-label={`Actions for ${name}`}>More</summary>
        <ul>
          {status === "active" ? (
            <>
              <li>
                <button type="button" onClick={openRenameDialog}>
                  Rename
                </button>
              </li>
              <li>
                <button
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
        <dialog ref={renameDialogRef} aria-labelledby={`rename-title-${id}`}>
          <form action={saveRename}>
            <div>
              <h2 id={`rename-title-${id}`}>Rename itinerary</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={closeRenameDialog}
              >
                ×
              </button>
            </div>

            <input type="hidden" name="id" value={id} />
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

            <div>
              <button type="button" onClick={closeRenameDialog}>
                Cancel
              </button>
              <button type="submit">Save</button>
            </div>
          </form>
        </dialog>
      ) : null}

      <dialog
        ref={confirmDialogRef}
        aria-labelledby={`confirm-title-${id}`}
        onClose={() => {
          pendingActionRef.current = null;
          setConfirmMessage("");
        }}
      >
        <form action={submitConfirm}>
          <p id={`confirm-title-${id}`}>{confirmMessage}</p>
          <input type="hidden" name="id" value={id} />
          <div>
            <button type="button" onClick={closeConfirm}>
              No
            </button>
            <button type="submit">Yes</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
