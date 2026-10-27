"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import type { SubmitEvent } from "react";
import { useFormStatus } from "react-dom";
import { createActivity } from "../actions";
import { closeDialogOnEscape } from "../dialog";
import dialogStyles from "../dialog.module.css";
import CategorySelect, { categoriesForStop, type CategoryOption } from "./CategorySelect";
import StopSelect, { type StopOption } from "./StopSelect";

function CreateButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className="primary" type="submit" disabled={disabled || pending}>
      Create
    </button>
  );
}

export type ActivitySlot = {
  date: string;
  startTime: string;
  endTime: string;
  label: string;
};

export default function ActivityCreate({
  itineraryId,
  categories,
  stops = [],
  defaultStopId = null,
  dialogRef,
  slot = null,
  onDismiss,
}: {
  itineraryId: string;
  categories: CategoryOption[];
  stops?: StopOption[];
  defaultStopId?: string | null;
  dialogRef: RefObject<HTMLDialogElement | null>;
  slot?: ActivitySlot | null;
  onDismiss?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const nameId = useId();
  const noteId = useId();
  const categoryFieldId = useId();
  const stopFieldId = useId();
  const sidebarFieldId = useId();
  const fromTimeline = slot !== null;
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [stopId, setStopId] = useState(defaultStopId ?? "");
  const [addToSidebar, setAddToSidebar] = useState(false);
  const showPlaceFields = !fromTimeline || addToSidebar;
  const placeCategories = categoriesForStop(categories, stopId);
  const canSubmit = name.trim() !== "";

  const chooseStop = (nextStopId: string) => {
    setStopId(nextStopId);
    setCategoryId((current) =>
      categoriesForStop(categories, nextStopId).some((category) => category.id === current)
        ? current
        : "",
    );
  };

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog || dialog.open) {
      return;
    }

    setStopId(defaultStopId ?? "");
  }, [defaultStopId, dialogRef]);

  const closeDialog = () => {
    dialogRef.current?.close();
  };

  const resetDialog = () => {
    formRef.current?.reset();
    setName("");
    setNote("");
    setCategoryId("");
    setStopId(defaultStopId ?? "");
    setAddToSidebar(false);
    onDismiss?.();
  };

  const guardSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    if (!canSubmit) {
      event.preventDefault();
    }
  };

  const save = async (formData: FormData) => {
    await createActivity(formData);
    closeDialog();
  };

  return (
    <dialog
      ref={dialogRef}
      className={`${dialogStyles.dialog} ${dialogStyles.menuDialog}`}
      aria-labelledby={titleId}
      onClose={resetDialog}
      onKeyDown={closeDialogOnEscape}
    >
      <form
        ref={formRef}
        className={dialogStyles.form}
        action={save}
        onSubmit={guardSubmit}
      >
        <input type="hidden" name="itineraryId" value={itineraryId} />

        <div className={dialogStyles.header}>
          <h2 id={titleId} className={dialogStyles.title}>
            New activity
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
          {slot ? (
            <>
              <p className={dialogStyles.when}>{slot.label}</p>
              <input type="hidden" name="date" value={slot.date} />
              <input type="hidden" name="startTime" value={slot.startTime} />
              <input type="hidden" name="endTime" value={slot.endTime} />
            </>
          ) : null}

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

          {fromTimeline ? (
            <>
              <input type="hidden" name="inSidebar" value={addToSidebar ? "true" : "false"} />
              <label className={dialogStyles.choice} htmlFor={sidebarFieldId}>
                <input
                  id={sidebarFieldId}
                  type="checkbox"
                  checked={addToSidebar}
                  onChange={(event) => setAddToSidebar(event.target.checked)}
                />
                Add to activities sidebar
              </label>
            </>
          ) : null}

          {showPlaceFields ? (
            <>
              <div className={dialogStyles.field}>
                <label htmlFor={stopFieldId}>Place</label>
                <StopSelect
                  id={stopFieldId}
                  stops={stops}
                  value={stopId}
                  onChange={chooseStop}
                />
              </div>

              <div className={dialogStyles.field}>
                <label htmlFor={categoryFieldId}>Category</label>
                <CategorySelect
                  id={categoryFieldId}
                  categories={placeCategories}
                  value={categoryId}
                  onChange={setCategoryId}
                />
              </div>
            </>
          ) : null}
        </div>

        <div className={dialogStyles.actions}>
          <button className="secondary" type="button" onClick={closeDialog}>
            Cancel
          </button>
          <CreateButton disabled={!canSubmit} />
        </div>
      </form>
    </dialog>
  );
}
