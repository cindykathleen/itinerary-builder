"use client";

import { useRef } from "react";
import ActivityCreate from "./ActivityCreate";
import CategoryCreate from "./CategoryCreate";
import type { CategoryOption } from "./CategorySelect";
import styles from "./page.module.css";

export default function ActivityAdd({
  itineraryId,
  categories,
}: {
  itineraryId: string;
  categories: CategoryOption[];
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const categoryDialogRef = useRef<HTMLDialogElement>(null);
  const activityDialogRef = useRef<HTMLDialogElement>(null);

  const closeMenu = () => {
    menuRef.current?.removeAttribute("open");
  };

  const openCategoryDialog = () => {
    closeMenu();
    categoryDialogRef.current?.showModal();
  };

  const openActivityDialog = () => {
    closeMenu();
    activityDialogRef.current?.showModal();
  };

  return (
    <>
      <details ref={menuRef} className={styles.addMenu}>
        <summary className={styles.add} aria-label="Add">
          <span aria-hidden="true">+</span>
        </summary>
        <ul className={styles.addDropdown}>
          <li>
            <button className={styles.addAction} type="button" onClick={openCategoryDialog}>
              New category
            </button>
          </li>
          <li>
            <button className={styles.addAction} type="button" onClick={openActivityDialog}>
              New activity
            </button>
          </li>
        </ul>
      </details>
      <CategoryCreate itineraryId={itineraryId} dialogRef={categoryDialogRef} />
      <ActivityCreate
        itineraryId={itineraryId}
        categories={categories}
        dialogRef={activityDialogRef}
      />
    </>
  );
}
