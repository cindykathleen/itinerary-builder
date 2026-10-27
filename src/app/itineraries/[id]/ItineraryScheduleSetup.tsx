"use client";

import { useEffect, useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { useFormStatus } from "react-dom";
import { saveItinerarySchedule } from "../actions";
import dialogStyles from "../dialog.module.css";

function isEndTimeBeforeStart(start: string, end: string) {
  return Boolean(start && end && end <= start);
}

function addPlaces(existing: string[], raw: string) {
  if (!raw.includes(",")) {
    return { places: existing, draft: raw };
  }

  const parts = raw.split(",");
  const endsWithComma = raw.endsWith(",");
  const incoming = (endsWithComma ? parts : parts.slice(0, -1))
    .map((part) => part.trim())
    .filter((part) => part !== "" && part.length <= 255);
  const draft = endsWithComma ? "" : parts[parts.length - 1].replace(/^\s+/, "");
  const places = [...existing];
  const seen = new Set(existing.map((place) => place.toLocaleLowerCase()));

  for (const name of incoming) {
    const key = name.toLocaleLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    places.push(name);
  }

  return { places, draft };
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
  const placeInputRef = useRef<HTMLInputElement>(null);
  const [places, setPlaces] = useState<string[]>([]);
  const [placeDraft, setPlaceDraft] = useState("");
  const [dayStart, setDayStart] = useState("");
  const [dayEnd, setDayEnd] = useState("");
  const [timeInterval, setTimeInterval] = useState("");
  const timeRangeError = isEndTimeBeforeStart(dayStart, dayEnd);
  const hasPlace = places.length > 0 || placeDraft.trim() !== "";
  const fieldsFilled = hasPlace && dayStart !== "" && dayEnd !== "" && timeInterval !== "";
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

  const commitDraft = () => {
    const name = placeDraft.trim();

    if (name === "" || name.length > 255) {
      setPlaceDraft("");
      return;
    }

    setPlaces((current) =>
      current.some((place) => place.toLocaleLowerCase() === name.toLocaleLowerCase())
        ? current
        : [...current, name],
    );
    setPlaceDraft("");
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
        {places.map((place) => (
          <input key={place} type="hidden" name="places" value={place} />
        ))}

        <div className={dialogStyles.header}>
          <h2 id="schedule-setup-title" className={dialogStyles.title}>
            Settings
          </h2>
        </div>

        <div className={dialogStyles.body}>
          <div className={dialogStyles.field}>
            <label htmlFor="schedule-places">
              Places <span className="required">*</span>
            </label>
            <p id="schedule-places-help" className={dialogStyles.note}>
              Enter the places you plan to visit, separated by commas.
            </p>
            <div
              className={dialogStyles.places}
              onClick={() => placeInputRef.current?.focus()}
            >
              {places.map((place) => (
                <span key={place} className={dialogStyles.placePill}>
                  <span className={dialogStyles.placeName}>{place}</span>
                  <button
                    className={dialogStyles.placeRemove}
                    type="button"
                    aria-label={`Remove ${place}`}
                    onClick={() =>
                      setPlaces((current) => current.filter((item) => item !== place))
                    }
                  >
                    <span className={dialogStyles.placeRemoveIcon} aria-hidden="true">
                      ×
                    </span>
                  </button>
                </span>
              ))}
              <input
                ref={placeInputRef}
                id="schedule-places"
                name="placeDraft"
                type="text"
                value={placeDraft}
                maxLength={255}
                aria-describedby="schedule-places-help"
                onChange={(event) => {
                  const value =
                    placeDraft === "" ? event.target.value.replace(/^ /, "") : event.target.value;
                  const next = addPlaces(places, value);
                  setPlaces(next.places);
                  setPlaceDraft(next.draft);
                }}
                onBlur={commitDraft}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    if (placeDraft.trim() !== "") {
                      event.preventDefault();
                      commitDraft();
                    }
                    return;
                  }

                  if (event.key === " " && placeDraft === "") {
                    event.preventDefault();
                    return;
                  }

                  if (event.key === "Backspace" && placeDraft === "" && places.length > 0) {
                    event.preventDefault();
                    setPlaces((current) => current.slice(0, -1));
                  }
                }}
              />
            </div>
          </div>

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
