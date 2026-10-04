"use client";

import { useRef, useState } from "react";
import type { RefObject } from "react";
import type { SubmitEvent } from "react";
import { useFormStatus } from "react-dom";
import { createCategory } from "../actions";
import { closeDialogOnEscape } from "../dialog";
import dialogStyles from "../dialog.module.css";

const DEFAULT_COLOR = "E0E6ED";

function hexDigits(value: string) {
  return value.replace(/#/g, "").replace(/[^0-9A-Fa-f]/g, "").slice(0, 6);
}

function CreateButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className="primary" type="submit" disabled={disabled || pending}>
      Create
    </button>
  );
}

export default function CategoryCreate({
  itineraryId,
  dialogRef,
}: {
  itineraryId: string;
  dialogRef: RefObject<HTMLDialogElement | null>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);
  const colorPickerRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const colorComplete = /^[0-9A-Fa-f]{6}$/.test(color);
  const colorError = color !== "" && !colorComplete;
  const canSubmit = name.trim() !== "" && !colorError;
  const previewColor = colorComplete ? `#${color}` : "var(--surface)";
  const pickerValue = (colorComplete ? `#${color}` : `#${DEFAULT_COLOR}`).toLowerCase();

  const closeDialog = () => {
    dialogRef.current?.close();
  };

  const resetDialog = () => {
    formRef.current?.reset();
    setName("");
    setColor(DEFAULT_COLOR);
    colorRef.current?.setCustomValidity("");
  };

  const guardSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    if (!canSubmit) {
      event.preventDefault();
      return;
    }

    colorRef.current?.setCustomValidity(
      colorError ? "Color must be a 6-digit hex code." : "",
    );

    if (colorError) {
      event.preventDefault();
      colorRef.current?.reportValidity();
    }
  };

  const save = async (formData: FormData) => {
    await createCategory(formData);
    closeDialog();
  };

  const openColorPicker = () => {
    const picker = colorPickerRef.current;
    const dialog = dialogRef.current;
    const preview = previewRef.current;

    if (!picker) {
      return;
    }

    if (dialog && preview) {
      const dialogRect = dialog.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      picker.style.top = `${previewRect.top - dialogRect.top}px`;
    }

    if (typeof picker.showPicker === "function") {
      try {
        picker.showPicker();
        return;
      } catch {
        picker.click();
        return;
      }
    }

    picker.click();
  };

  return (
    <dialog
      ref={dialogRef}
      className={`${dialogStyles.dialog} ${dialogStyles.colorDialog}`}
      aria-labelledby="category-create-title"
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
          <h2 id="category-create-title" className={dialogStyles.title}>
            New category
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
            <label htmlFor="category-name">
              Name <span className="required">*</span>
            </label>
            <input
              id="category-name"
              name="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={255}
              required
            />
          </div>

          <div className={dialogStyles.field}>
            <label htmlFor="category-color">Color</label>
            <div className={dialogStyles.colorControl}>
              <div className={dialogStyles.colorField}>
                <span>#</span>
                <input
                  ref={colorRef}
                  id="category-color"
                  name="color"
                  type="text"
                  value={color}
                  onChange={(event) => setColor(hexDigits(event.target.value))}
                  maxLength={6}
                  spellCheck={false}
                  aria-invalid={colorError || undefined}
                  aria-describedby={colorError ? "category-color-error" : undefined}
                />
              </div>
              <button
                ref={previewRef}
                className={dialogStyles.colorPreview}
                type="button"
                style={{ backgroundColor: previewColor }}
                aria-label="Choose color"
                onClick={openColorPicker}
              />
              <input
                ref={colorPickerRef}
                className={dialogStyles.colorPicker}
                type="color"
                value={pickerValue}
                onChange={(event) => setColor(hexDigits(event.target.value).toUpperCase())}
                tabIndex={-1}
                aria-hidden="true"
              />
            </div>
            {colorError ? (
              <p id="category-color-error" className={dialogStyles.hint} role="alert">
                Enter 6 hex digits, like 0066CC.
              </p>
            ) : null}
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
