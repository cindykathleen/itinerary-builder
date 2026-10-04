"use client";

import { useEffect, useId, useRef, useState } from "react";
import dialogStyles from "../dialog.module.css";

export type CategoryOption = {
  id: string;
  name: string;
  color: string;
};

const NONE_COLOR = "var(--surface)";

export default function CategorySelect({
  id,
  categories,
  value,
  onChange,
}: {
  id: string;
  categories: CategoryOption[];
  value: string;
  onChange: (categoryId: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const selected = categories.find((category) => category.id === value);

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

  const choose = (categoryId: string) => {
    onChange(categoryId);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={dialogStyles.categorySelect}>
      <input type="hidden" name="categoryId" value={value} />
      <button
        id={id}
        className={dialogStyles.categorySelectTrigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        <span
          className={dialogStyles.categorySwatch}
          style={{ backgroundColor: selected?.color ?? NONE_COLOR }}
          aria-hidden="true"
        />
        <span className={dialogStyles.categorySelectLabel}>{selected?.name ?? "None"}</span>
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
              <span
                className={dialogStyles.categorySwatch}
                style={{ backgroundColor: NONE_COLOR }}
                aria-hidden="true"
              />
              None
            </button>
          </li>
          {categories.map((category) => (
            <li key={category.id}>
              <button
                className={dialogStyles.categorySelectOption}
                type="button"
                role="option"
                aria-selected={value === category.id}
                onClick={() => choose(category.id)}
              >
                <span
                  className={dialogStyles.categorySwatch}
                  style={{ backgroundColor: category.color }}
                  aria-hidden="true"
                />
                {category.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
