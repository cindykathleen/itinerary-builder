"use client";

import { useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { useFormStatus } from "react-dom";
import { deleteCategory, updateCategory } from "../actions";
import ActivityItem from "./ActivityItem";
import { closeDialogOnEscape } from "../dialog";
import dialogStyles from "../dialog.module.css";
import type { CategoryOption } from "./CategorySelect";
import styles from "./page.module.css";

const DEFAULT_COLOR = "E0E6ED";
const TEXT_PRIMARY = "#1A202C";
const WHITE = "#FFFFFF";

function srgbChannel(value: number) {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string) {
  const red = srgbChannel(Number.parseInt(hex.slice(1, 3), 16));
  const green = srgbChannel(Number.parseInt(hex.slice(3, 5), 16));
  const blue = srgbChannel(Number.parseInt(hex.slice(5, 7), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: number, second: number) {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

const textPrimaryLuminance = relativeLuminance(TEXT_PRIMARY);
const whiteLuminance = relativeLuminance(WHITE);

function categoryTextColor(background: string) {
  if (!/^#[0-9A-Fa-f]{6}$/.test(background)) {
    return undefined;
  }

  const luminance = relativeLuminance(background);
  const whiteContrast = contrastRatio(luminance, whiteLuminance);
  const textContrast = contrastRatio(luminance, textPrimaryLuminance);
  return whiteContrast > textContrast ? WHITE : undefined;
}

function hexDigits(value: string) {
  return value.replace(/#/g, "").replace(/[^0-9A-Fa-f]/g, "").slice(0, 6);
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className="primary" type="submit" disabled={disabled || pending}>
      Save
    </button>
  );
}

export default function CategoryItem({
  itineraryId,
  id,
  name: categoryName,
  color: categoryColor,
  activities,
  categories,
  readOnly = false,
}: {
  itineraryId: string;
  id: string;
  name: string;
  color: string;
  activities: { id: string; name: string; note: string | null }[];
  categories: CategoryOption[];
  readOnly?: boolean;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);
  const colorPickerRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState(categoryName);
  const [color, setColor] = useState(hexDigits(categoryColor));
  const colorComplete = /^[0-9A-Fa-f]{6}$/.test(color);
  const colorError = color !== "" && !colorComplete;
  const canSubmit = name.trim() !== "" && !colorError;
  const previewColor = colorComplete ? `#${color}` : "var(--surface)";
  const pickerValue = (colorComplete ? `#${color}` : `#${DEFAULT_COLOR}`).toLowerCase();
  const backgroundColor = /^#[0-9A-Fa-f]{6}$/.test(categoryColor)
    ? categoryColor
    : "var(--surface)";
  const textColor = categoryTextColor(backgroundColor);
  const nameId = `category-edit-name-${id}`;
  const colorId = `category-edit-color-${id}`;
  const titleId = `category-edit-title-${id}`;
  const colorErrorId = `category-edit-color-error-${id}`;
  const confirmTitleId = `category-delete-title-${id}`;

  const resetFields = () => {
    setName(categoryName);
    setColor(hexDigits(categoryColor) || DEFAULT_COLOR);
    colorRef.current?.setCustomValidity("");
  };

  const closeMenu = () => {
    menuRef.current?.removeAttribute("open");
  };

  const placeDropdown = () => {
    const menu = menuRef.current;
    const dropdown = dropdownRef.current;

    if (!menu || !dropdown || !menu.open) {
      return;
    }

    const rect = menu.getBoundingClientRect();
    dropdown.style.position = "fixed";
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.right = `${window.innerWidth - rect.right}px`;
    dropdown.style.left = "auto";
  };

  const openDialog = () => {
    closeMenu();
    resetFields();
    dialogRef.current?.showModal();
  };

  const openDeleteConfirm = () => {
    closeMenu();
    confirmRef.current?.showModal();
  };

  const closeDeleteConfirm = () => {
    confirmRef.current?.close();
  };

  const remove = async (formData: FormData) => {
    closeDeleteConfirm();
    await deleteCategory(formData);
  };

  const closeDialog = () => {
    dialogRef.current?.close();
  };

  const resetDialog = () => {
    formRef.current?.reset();
    resetFields();
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
    await updateCategory(formData);
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
    <li className={styles.categoryGroup}>
      <div className={styles.category} style={{ backgroundColor, color: textColor }}>
      <h3>{categoryName}</h3>
      {readOnly ? null : (
      <details ref={menuRef} className={styles.categoryMenu} onToggle={placeDropdown}>
        <summary className={styles.categoryMenuTrigger} aria-label={`Actions for ${categoryName}`}>
          <span aria-hidden="true">⋮</span>
        </summary>
        <ul ref={dropdownRef} className={styles.categoryMenuDropdown}>
          <li>
            <button className={styles.categoryMenuAction} type="button" onClick={openDialog}>
              Edit
            </button>
          </li>
          <li>
            <button className={styles.categoryMenuAction} type="button" onClick={openDeleteConfirm}>
              Delete
            </button>
          </li>
        </ul>
      </details>
      )}
      </div>
      {activities.length > 0 ? (
        <ul className={styles.activityList}>
          {activities.map((activity) => (
            <ActivityItem
              key={activity.id}
              itineraryId={itineraryId}
              id={activity.id}
              name={activity.name}
              note={activity.note}
              categoryId={readOnly ? null : id}
              categories={categories}
            />
          ))}
        </ul>
      ) : null}

      {readOnly ? null : (
      <>
      <dialog
        ref={dialogRef}
        className={`${dialogStyles.dialog} ${dialogStyles.colorDialog}`}
        aria-labelledby={titleId}
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
          <input type="hidden" name="id" value={id} />

          <div className={dialogStyles.header}>
            <h2 id={titleId} className={dialogStyles.title}>
              Edit category
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

            <div className={dialogStyles.field}>
              <label htmlFor={colorId}>Color</label>
              <div className={dialogStyles.colorControl}>
                <div className={dialogStyles.colorField}>
                  <span>#</span>
                  <input
                    ref={colorRef}
                    id={colorId}
                    name="color"
                    type="text"
                    value={color}
                    onChange={(event) => setColor(hexDigits(event.target.value))}
                    maxLength={6}
                    spellCheck={false}
                    aria-invalid={colorError || undefined}
                    aria-describedby={colorError ? colorErrorId : undefined}
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
                  onChange={(event) =>
                    setColor(hexDigits(event.target.value).toUpperCase())
                  }
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </div>
              {colorError ? (
                <p id={colorErrorId} className={dialogStyles.hint} role="alert">
                  Enter 6 hex digits, like 0066CC.
                </p>
              ) : null}
            </div>
          </div>

          <div className={dialogStyles.actions}>
            <button className="secondary" type="button" onClick={closeDialog}>
              Cancel
            </button>
            <SaveButton disabled={!canSubmit} />
          </div>
        </form>
      </dialog>

      <dialog
        ref={confirmRef}
        className={dialogStyles.dialog}
        aria-labelledby={confirmTitleId}
        onKeyDown={closeDialogOnEscape}
      >
        <form className={dialogStyles.form} action={remove}>
          <input type="hidden" name="itineraryId" value={itineraryId} />
          <input type="hidden" name="id" value={id} />

          <div className={dialogStyles.header}>
            <p id={confirmTitleId} className={dialogStyles.title}>
              Delete &ldquo;{categoryName}&rdquo;?
            </p>
            <button
              className={dialogStyles.close}
              type="button"
              aria-label="Close"
              onClick={closeDeleteConfirm}
            >
              ×
            </button>
          </div>

          <div className={dialogStyles.actions}>
            <button className="secondary" type="button" onClick={closeDeleteConfirm}>
              No
            </button>
            <button className="primary" type="submit">
              Yes
            </button>
          </div>
        </form>
      </dialog>
      </>
      )}
    </li>
  );
}
