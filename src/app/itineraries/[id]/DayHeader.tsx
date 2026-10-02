"use client";

import { useRef, useState } from "react";
import { saveItineraryDayHeading } from "../actions";
import styles from "./ItineraryTimeline.module.css";

export default function DayHeader({
  itineraryId,
  date,
  label,
  heading,
}: {
  itineraryId: string;
  date: string;
  label: string;
  heading: string;
}) {
  const [value, setValue] = useState(heading);
  const saved = useRef(heading);
  const skipCommit = useRef(false);

  const commit = async () => {
    const next = value.trim();

    if (next === saved.current) {
      if (value !== next) {
        setValue(next);
      }
      return;
    }

    await saveItineraryDayHeading(itineraryId, date, next);
    saved.current = next;
    setValue(next);
  };

  return (
    <input
      className={styles.headerInput}
      type="text"
      aria-label={`Header for ${label}`}
      value={value}
      maxLength={255}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (skipCommit.current) {
          skipCommit.current = false;
          return;
        }

        void commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }

        if (event.key === "Escape") {
          skipCommit.current = true;
          setValue(saved.current);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
