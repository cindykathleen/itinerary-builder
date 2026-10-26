"use client";

import { useEffect, useId, useRef, useState } from "react";
import dialogStyles from "../dialog.module.css";

export type StopOption = {
  id: string;
  name: string;
};

export default function StopSelect({
  id,
  stops,
  value,
  onChange,
}: {
  id: string;
  stops: StopOption[];
  value: string;
  onChange: (stopId: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const selected = stops.find((stop) => stop.id === value);

  useEffect(() => {
    const dialog = rootRef.current?.closest("dialog");

    if (!dialog) {
      return;
    }

    const closeMenu = () => setOpen(false);
    dialog.addEventListener("close", closeMenu);

    return () => dialog.removeEventListener("close", closeMenu);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const choose = (stopId: string) => {
    onChange(stopId);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={dialogStyles.categorySelect}>
      <input type="hidden" name="stopId" value={value} />
      <button
        id={id}
        className={dialogStyles.categorySelectTrigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={dialogStyles.categorySelectLabel}>{selected?.name ?? "Logistics"}</span>
        <span className={dialogStyles.categorySelectChevron} aria-hidden="true" />
      </button>
      {open ? (
        <ul id={listId} className={dialogStyles.categorySelectMenu} role="listbox">
          <li>
            <button
              className={dialogStyles.categorySelectOption}
              type="button"
              role="option"
              aria-selected={value === ""}
              onClick={() => choose("")}
            >
              Logistics
            </button>
          </li>
          {stops.map((stop) => (
            <li key={stop.id}>
              <button
                className={dialogStyles.categorySelectOption}
                type="button"
                role="option"
                aria-selected={value === stop.id}
                onClick={() => choose(stop.id)}
              >
                {stop.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
