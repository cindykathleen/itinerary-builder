"use client";

import { useEffect, useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { useFormStatus } from "react-dom";
import { saveItinerarySchedule } from "../actions";
import dialogStyles from "../dialog.module.css";

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

export default function ItineraryScheduleSetup({
  itineraryId,
}: {
  itineraryId: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const endTimeRef = useRef<HTMLInputElement>(null);
  const [dayStart, setDayStart] = useState("");
  const [dayEnd, setDayEnd] = useState("");
  const [timeInterval, setTimeInterval] = useState("");
  const timeRangeError = isEndTimeBeforeStart(dayStart, dayEnd);
  const fieldsFilled = dayStart !== "" && dayEnd !== "" && timeInterval !== "";
  const canSubmit = fieldsFilled && !timeRangeError;

  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  const setTimeRangeValidity = (start: string, end: string) => {
    endTimeRef.current?.setCustomValidity(
      isEndTimeBeforeStart(start, end)
        ? "Day end must be later than the day start."
        : "",
    );
  };

  const guardSchedule = (event: SubmitEvent<HTMLFormElement>) => {
    if (!canSubmit) {
      event.preventDefault();
      return;
    }

    setTimeRangeValidity(dayStart, dayEnd);

    if (timeRangeError) {
      event.preventDefault();
      endTimeRef.current?.reportValidity();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className={dialogStyles.dialog}
      aria-labelledby="schedule-setup-title"
      onCancel={(event) => {
        event.preventDefault();
      }}
    >
      <form
        className={dialogStyles.form}
        action={saveItinerarySchedule}
        onSubmit={guardSchedule}
      >
        <input type="hidden" name="id" value={itineraryId} />

        <div className={dialogStyles.header}>
          <h2 id="schedule-setup-title" className={dialogStyles.title}>
            Settings
          </h2>
        </div>

        <div className={dialogStyles.body}>
          <div className={dialogStyles.field}>
            <label htmlFor="schedule-day-start">
              Day start <span className="required">*</span>
            </label>
            <input
              id="schedule-day-start"
              name="dayStart"
              type="time"
              value={dayStart}
              onChange={(event) => {
                const value = event.target.value;
                setDayStart(value);
                setTimeRangeValidity(value, dayEnd);
              }}
              required
            />
          </div>

          <div className={dialogStyles.field}>
            <label htmlFor="schedule-day-end">
              Day end <span className="required">*</span>
            </label>
            <input
              id="schedule-day-end"
              name="dayEnd"
              type="time"
              ref={endTimeRef}
              value={dayEnd}
              onChange={(event) => {
                const value = event.target.value;
                setDayEnd(value);
                setTimeRangeValidity(dayStart, value);
              }}
              required
              aria-invalid={timeRangeError || undefined}
              aria-describedby={timeRangeError ? "schedule-time-error" : undefined}
            />
            {timeRangeError ? (
              <p id="schedule-time-error" className={dialogStyles.hint} role="alert">
                Day end must be later than the day start.
              </p>
            ) : null}
          </div>

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
          <SaveButton disabled={!canSubmit} />
        </div>
      </form>
    </dialog>
  );
}
