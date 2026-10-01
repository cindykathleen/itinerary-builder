"use client";

import { useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { createItinerary } from "./actions";

function isEndDateBeforeStart(start: string, end: string) {
  return Boolean(start && end && end < start);
}

export default function ItineraryCreate() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const dateRangeError = isEndDateBeforeStart(dateStart, dateEnd);

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
    setDateStart("");
    setDateEnd("");
    setDateRangeValidity("", "");
  };

  const guardDateRange = (event: SubmitEvent<HTMLFormElement>) => {
    setDateRangeValidity(dateStart, dateEnd);

    if (dateRangeError) {
      event.preventDefault();
      endDateRef.current?.reportValidity();
    }
  };

  return (
    <>
      <button type="button" onClick={openCreateDialog}>
        New itinerary
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="create-itinerary-title"
        onClose={resetCreateDialog}
      >
        <form ref={formRef} action={createItinerary} onSubmit={guardDateRange}>
          <div>
            <h2 id="create-itinerary-title">New itinerary</h2>
            <button
              type="button"
              aria-label="Close"
              onClick={closeCreateDialog}
            >
              ×
            </button>
          </div>

          <label htmlFor="create-name">Name</label>
          <input
            id="create-name"
            name="name"
            type="text"
            maxLength={255}
            required
          />

          <fieldset>
            <legend>Date range</legend>
            <label htmlFor="create-date-start">Start date</label>
            <input
              id="create-date-start"
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
            <label htmlFor="create-date-end">End date</label>
            <input
              id="create-date-end"
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
              aria-describedby={dateRangeError ? "create-date-range-error" : undefined}
            />
            {dateRangeError ? (
              <p id="create-date-range-error" role="alert">
                End date cannot be earlier than the start date.
              </p>
            ) : null}
          </fieldset>

          <label htmlFor="create-destination">Destination</label>
          <input
            id="create-destination"
            name="destination"
            type="text"
            maxLength={255}
            required
          />

          <div>
            <button type="button" onClick={closeCreateDialog}>
              Cancel
            </button>
            <button type="submit">Create</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
