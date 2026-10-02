"use client";

import { useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { createItinerary } from "./actions";
import { closeDialogOnEscape } from "./dialog";
import dialogStyles from "./dialog.module.css";

function isEndDateBeforeStart(start: string, end: string) {
  return Boolean(start && end && end < start);
}

export default function ItineraryCreate({
  variant = "secondary",
  idPrefix = "create",
}: {
  variant?: "primary" | "secondary";
  idPrefix?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const titleId = `${idPrefix}-title`;
  const nameId = `${idPrefix}-name`;
  const dateStartId = `${idPrefix}-date-start`;
  const dateEndId = `${idPrefix}-date-end`;
  const dateErrorId = `${idPrefix}-date-error`;
  const destinationId = `${idPrefix}-destination`;
  const [name, setName] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const dateRangeError = isEndDateBeforeStart(dateStart, dateEnd);
  const fieldsFilled =
    name.trim() !== "" && dateStart !== "" && dateEnd !== "";
  const canSubmit = fieldsFilled && !dateRangeError;

  const setDateRangeValidity = (start: string, end: string) => {
    endDateRef.current?.setCustomValidity(
      isEndDateBeforeStart(start, end)
        ? "End date cannot be earlier than the start date."
        : "",
    );
  };

  const openCreateDialog = () => {
    dialogRef.current?.showModal();
  };

  const closeCreateDialog = () => {
    dialogRef.current?.close();
  };

  const resetCreateDialog = () => {
    formRef.current?.reset();
    setName("");
    setDateStart("");
    setDateEnd("");
    setDateRangeValidity("", "");
  };

  const guardDateRange = (event: SubmitEvent<HTMLFormElement>) => {
    if (!canSubmit) {
      event.preventDefault();
      return;
    }

    setDateRangeValidity(dateStart, dateEnd);

    if (dateRangeError) {
      event.preventDefault();
      endDateRef.current?.reportValidity();
    }
  };

  return (
    <>
      <button
        className={variant}
        type="button"
        onClick={openCreateDialog}
      >
        + New
      </button>

      <dialog
        ref={dialogRef}
        className={dialogStyles.dialog}
        aria-labelledby={titleId}
        onClose={resetCreateDialog}
        onKeyDown={closeDialogOnEscape}
      >
        <form
          ref={formRef}
          className={dialogStyles.form}
          action={createItinerary}
          onSubmit={guardDateRange}
        >
          <div className={dialogStyles.header}>
            <h2 id={titleId} className={dialogStyles.title}>
              New itinerary
            </h2>
            <button
              className={dialogStyles.close}
              type="button"
              aria-label="Close"
              onClick={closeCreateDialog}
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

            <fieldset className={dialogStyles.fieldset}>
              <div className={dialogStyles.field}>
                <label htmlFor={dateStartId}>
                  Start date <span className="required">*</span>
                </label>
                <input
                  id={dateStartId}
                  name="dateStart"
                  type="date"
                  value={dateStart}
                  max={dateEnd || undefined}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDateStart(value);
                    setDateRangeValidity(value, dateEnd);
                  }}
                  required
                />
              </div>
              <div className={dialogStyles.field}>
                <label htmlFor={dateEndId}>
                  End date <span className="required">*</span>
                </label>
                <input
                  id={dateEndId}
                  name="dateEnd"
                  type="date"
                  ref={endDateRef}
                  value={dateEnd}
                  min={dateStart || undefined}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDateEnd(value);
                    setDateRangeValidity(dateStart, value);
                  }}
                  required
                  aria-invalid={dateRangeError || undefined}
                  aria-describedby={dateRangeError ? dateErrorId : undefined}
                />
                {dateRangeError ? (
                  <p id={dateErrorId} className={dialogStyles.hint} role="alert">
                    End date cannot be earlier than the start date.
                  </p>
                ) : null}
              </div>
            </fieldset>

            <div className={dialogStyles.field}>
              <label htmlFor={destinationId}>Destination</label>
              <input
                id={destinationId}
                name="destination"
                type="text"
                maxLength={255}
              />
            </div>
          </div>

          <div className={dialogStyles.actions}>
            <button
              className="secondary"
              type="button"
              onClick={closeCreateDialog}
            >
              Cancel
            </button>
            <button
              className="primary"
              type="submit"
              disabled={!canSubmit}
            >
              Create
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
