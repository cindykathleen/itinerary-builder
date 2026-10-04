"use client";

import { useRef, useState } from "react";
import type { RefObject } from "react";
import type { SubmitEvent } from "react";
import { useFormStatus } from "react-dom";
import { createActivity } from "../actions";
import { closeDialogOnEscape } from "../dialog";
import dialogStyles from "../dialog.module.css";
import CategorySelect, { type CategoryOption } from "./CategorySelect";

function CreateButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className="primary" type="submit" disabled={disabled || pending}>
      Create
    </button>
  );
}

export default function ActivityCreate({
  itineraryId,
  categories,
  dialogRef,
}: {
  itineraryId: string;
  categories: CategoryOption[];
  dialogRef: RefObject<HTMLDialogElement | null>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const canSubmit = name.trim() !== "";

  const closeDialog = () => {
    dialogRef.current?.close();
  };

  const resetDialog = () => {
    formRef.current?.reset();
    setName("");
    setNote("");
    setCategoryId("");
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
      aria-labelledby="activity-create-title"
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
          <h2 id="activity-create-title" className={dialogStyles.title}>
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
          <div className={dialogStyles.field}>
            <label htmlFor="activity-name">
              Name <span className="required">*</span>
            </label>
            <input
              id="activity-name"
              name="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={255}
              required
            />
          </div>

          <div className={dialogStyles.field}>
            <label htmlFor="activity-note">Note</label>
            <textarea
              id="activity-note"
              name="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <div className={dialogStyles.field}>
            <label htmlFor="activity-category">Category</label>
            <CategorySelect
              id="activity-category"
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
          <CreateButton disabled={!canSubmit} />
        </div>
      </form>
    </dialog>
  );
}
