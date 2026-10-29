"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { useFormStatus } from "react-dom";
import { updateActivity } from "../actions";
import { closeDialogOnEscape } from "../dialog";
import dialogStyles from "../dialog.module.css";
import CategorySelect, { categoriesForStop, type CategoryOption } from "./CategorySelect";
import GooglePlaceField from "./GooglePlaceField";
import StopSelect, { type StopOption } from "./StopSelect";

export type EditableActivity = {
  id: string;
  name: string;
  note: string | null;
  googlePlaceId: string | null;
  googlePlaceName: string | null;
  googlePlaceAddress: string | null;
  categoryId: string | null;
  stopId: string | null;
  inSidebar: boolean;
};

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className="primary" type="submit" disabled={disabled || pending}>
      Save
    </button>
  );
}

export default function ActivityEditDialog({
  itineraryId,
  activity,
  categories,
  stops,
  openToken,
}: {
  itineraryId: string;
  activity: EditableActivity;
  categories: CategoryOption[];
  stops: StopOption[];
  openToken: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const activityRef = useRef(activity);
  const titleId = useId();
  const nameId = useId();
  const noteId = useId();
  const categoryFieldId = useId();
  const stopFieldId = useId();
  const sidebarFieldId = useId();
  const [name, setName] = useState(activity.name);
  const [note, setNote] = useState(activity.note ?? "");
  const [categoryId, setCategoryId] = useState(activity.categoryId ?? "");
  const [stopId, setStopId] = useState(activity.stopId ?? "");
  const [addToSidebar, setAddToSidebar] = useState(false);
  const [placeEditorKey, setPlaceEditorKey] = useState(0);
  const showPlaceFields = activity.inSidebar || addToSidebar;
  const placeCategories = categoriesForStop(categories, stopId);
  const canSubmit = name.trim() !== "";

  activityRef.current = activity;

  const applyActivity = (next: EditableActivity) => {
    setName(next.name);
    setNote(next.note ?? "");
    setCategoryId(next.categoryId ?? "");
    setStopId(next.stopId ?? "");
    setAddToSidebar(false);
    setPlaceEditorKey((key) => key + 1);
  };

  const chooseStop = (nextStopId: string) => {
    setStopId(nextStopId);
    setCategoryId((current) =>
      categoriesForStop(categories, nextStopId).some((category) => category.id === current)
        ? current
        : "",
    );
  };

  useEffect(() => {
    if (openToken === 0) {
      return;
    }

    applyActivity(activityRef.current);
    const dialog = dialogRef.current;

    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, [openToken]);

  const guardSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    if (!canSubmit) {
      event.preventDefault();
    }
  };

  const save = async (formData: FormData) => {
    await updateActivity(formData);
    dialogRef.current?.close();
  };

  return (
    <dialog
      ref={dialogRef}
      className={`${dialogStyles.dialog} ${dialogStyles.menuDialog}`}
      aria-labelledby={titleId}
      onClose={() => applyActivity(activityRef.current)}
      onKeyDown={closeDialogOnEscape}
    >
      <form className={dialogStyles.form} action={save} onSubmit={guardSubmit}>
        <input type="hidden" name="itineraryId" value={itineraryId} />
        <input type="hidden" name="id" value={activity.id} />

        <div className={dialogStyles.header}>
          <h2 id={titleId} className={dialogStyles.title}>
            Edit activity
          </h2>
          <button
            className={dialogStyles.close}
            type="button"
            aria-label="Close"
            onClick={() => dialogRef.current?.close()}
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

          <GooglePlaceField
            key={`${activity.googlePlaceId ?? ""}-${placeEditorKey}`}
            place={
              activity.googlePlaceId && activity.googlePlaceName
                ? {
                    placeId: activity.googlePlaceId,
                    name: activity.googlePlaceName,
                    address: activity.googlePlaceAddress ?? "",
                  }
                : null
            }
          />

          <div className={dialogStyles.field}>
            <label htmlFor={noteId}>Note</label>
            <textarea
              id={noteId}
              name="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          {activity.inSidebar ? null : (
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
          )}

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
          ) : (
            <>
              <input type="hidden" name="stopId" value={activity.stopId ?? ""} />
              <input type="hidden" name="categoryId" value={activity.categoryId ?? ""} />
            </>
          )}
        </div>

        <div className={dialogStyles.actions}>
          <button className="secondary" type="button" onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          <SaveButton disabled={!canSubmit} />
        </div>
      </form>
    </dialog>
  );
}
