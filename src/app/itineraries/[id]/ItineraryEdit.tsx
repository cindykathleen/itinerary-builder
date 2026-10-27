"use client";

import { useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { useFormStatus } from "react-dom";
import { updateItinerary } from "../actions";
import { closeDialogOnEscape } from "../dialog";
import dialogStyles from "../dialog.module.css";
import styles from "./page.module.css";

function isEndDateBeforeStart(start: string, end: string) {
  return Boolean(start && end && end < start);
}

function isEndTimeBeforeStart(start: string, end: string) {
  return Boolean(start && end && end <= start);
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className="primary" type="submit" disabled={disabled || pending}>
      Save
    </button>
  );
}

export default function ItineraryEdit({
  itinerary,
}: {
  itinerary: {
    id: string;
    name: string;
    destination: string;
    dateStart: string;
    dateEnd: string;
    dayStart: string;
    dayEnd: string;
    timeInterval: number;
  };
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const endTimeRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(itinerary.name);
  const [destination, setDestination] = useState(itinerary.destination);
  const [dateStart, setDateStart] = useState(itinerary.dateStart);
  const [dateEnd, setDateEnd] = useState(itinerary.dateEnd);
  const [dayStart, setDayStart] = useState(itinerary.dayStart);
  const [dayEnd, setDayEnd] = useState(itinerary.dayEnd);
  const [timeInterval, setTimeInterval] = useState(String(itinerary.timeInterval));
  const dateRangeError = isEndDateBeforeStart(dateStart, dateEnd);
  const timeRangeError = isEndTimeBeforeStart(dayStart, dayEnd);
  const fieldsFilled =
    name.trim() !== "" &&
    dateStart !== "" &&
    dateEnd !== "" &&
    dayStart !== "" &&
    dayEnd !== "" &&
    timeInterval !== "";
  const canSubmit = fieldsFilled && !dateRangeError && !timeRangeError;

  const openDialog = () => {
    setName(itinerary.name);
    setDestination(itinerary.destination);
    setDateStart(itinerary.dateStart);
    setDateEnd(itinerary.dateEnd);
    setDayStart(itinerary.dayStart);
    setDayEnd(itinerary.dayEnd);
    setTimeInterval(String(itinerary.timeInterval));
    endDateRef.current?.setCustomValidity("");
    endTimeRef.current?.setCustomValidity("");
    dialogRef.current?.showModal();
  };

  const closeDialog = () => {
    dialogRef.current?.close();
  };

  const save = async (formData: FormData) => {
    await updateItinerary(formData);
    closeDialog();
  };

  const guardSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    if (!canSubmit) {
      event.preventDefault();
      return;
    }

    endDateRef.current?.setCustomValidity(
      dateRangeError ? "End date cannot be earlier than the start date." : "",
    );
    endTimeRef.current?.setCustomValidity(
      timeRangeError ? "Day end must be later than the day start." : "",
    );

    if (dateRangeError) {
      event.preventDefault();
      endDateRef.current?.reportValidity();
      return;
    }

    if (timeRangeError) {
      event.preventDefault();
      endTimeRef.current?.reportValidity();
    }
  };

  return (
    <>
      <button className={styles.edit} type="button" onClick={openDialog}>
        Edit
      </button>

      <dialog
        ref={dialogRef}
        className={dialogStyles.dialog}
        aria-labelledby="edit-itinerary-title"
        onKeyDown={closeDialogOnEscape}
      >
        <form className={dialogStyles.form} action={save} onSubmit={guardSubmit}>
          <input type="hidden" name="id" value={itinerary.id} />

          <div className={dialogStyles.header}>
            <h2 id="edit-itinerary-title" className={dialogStyles.title}>
              Edit itinerary
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
              <label htmlFor="edit-name">
                Name <span className="required">*</span>
              </label>
              <input
                id="edit-name"
                name="name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={255}
                required
              />
            </div>

            <div className={dialogStyles.field}>
              <label htmlFor="edit-destination">Destination</label>
              <input
                id="edit-destination"
                name="destination"
                type="text"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                maxLength={255}
              />
            </div>

            <fieldset className={dialogStyles.fieldset}>
              <div className={dialogStyles.field}>
                <label htmlFor="edit-date-start">
                  Start date <span className="required">*</span>
                </label>
                <input
                  id="edit-date-start"
                  name="dateStart"
                  type="date"
                  value={dateStart}
                  max={dateEnd || undefined}
                  onChange={(event) => setDateStart(event.target.value)}
                  required
                />
              </div>
              <div className={dialogStyles.field}>
                <label htmlFor="edit-date-end">
                  End date <span className="required">*</span>
                </label>
                <input
                  id="edit-date-end"
                  name="dateEnd"
                  type="date"
                  ref={endDateRef}
                  value={dateEnd}
                  min={dateStart || undefined}
                  onChange={(event) => setDateEnd(event.target.value)}
                  required
                  aria-invalid={dateRangeError || undefined}
                  aria-describedby={dateRangeError ? "edit-date-error" : undefined}
                />
                {dateRangeError ? (
                  <p id="edit-date-error" className={dialogStyles.hint} role="alert">
                    End date cannot be earlier than the start date.
                  </p>
                ) : null}
              </div>
            </fieldset>

            <fieldset className={dialogStyles.fieldset}>
              <div className={dialogStyles.field}>
                <label htmlFor="edit-day-start">
                  Day start <span className="required">*</span>
                </label>
                <input
                  id="edit-day-start"
                  name="dayStart"
                  type="time"
                  value={dayStart}
                  onChange={(event) => setDayStart(event.target.value)}
                  required
                />
              </div>
              <div className={dialogStyles.field}>
                <label htmlFor="edit-day-end">
                  Day end <span className="required">*</span>
                </label>
                <input
                  id="edit-day-end"
                  name="dayEnd"
                  type="time"
                  ref={endTimeRef}
                  value={dayEnd}
                  onChange={(event) => setDayEnd(event.target.value)}
                  required
                  aria-invalid={timeRangeError || undefined}
                  aria-describedby={timeRangeError ? "edit-time-error" : undefined}
                />
                {timeRangeError ? (
                  <p id="edit-time-error" className={dialogStyles.hint} role="alert">
                    Day end must be later than the day start.
                  </p>
                ) : null}
              </div>
            </fieldset>

            <fieldset className={dialogStyles.fieldset}>
              <legend>
                Time interval <span className="required">*</span>
              </legend>
              <div className={dialogStyles.choices}>
                <label className={dialogStyles.choice}>
                  <input
                    type="radio"
                    name="timeInterval"
                    value="30"
                    checked={timeInterval === "30"}
                    onChange={(event) => setTimeInterval(event.target.value)}
                    required
                  />
                  30m
                </label>
                <label className={dialogStyles.choice}>
                  <input
                    type="radio"
                    name="timeInterval"
                    value="60"
                    checked={timeInterval === "60"}
                    onChange={(event) => setTimeInterval(event.target.value)}
                  />
                  1hr
                </label>
              </div>
            </fieldset>
          </div>

          <div className={dialogStyles.actions}>
            <button className="secondary" type="button" onClick={closeDialog}>
              Cancel
            </button>
            <SaveButton disabled={!canSubmit} />
          </div>
        </form>
      </dialog>
    </>
  );
}
