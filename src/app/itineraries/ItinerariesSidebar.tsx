"use client";

import { useRef } from "react";
import Link from "next/link";
import ItineraryCreate from "./ItineraryCreate";
import styles from "./ItinerariesSidebar.module.css";

export type ItineraryListStatus = "active" | "archived" | "trashed";

const filters: { href: string; label: string; status: ItineraryListStatus }[] = [
  { href: "/itineraries", label: "My Itineraries", status: "active" },
  { href: "/itineraries?status=archived", label: "Archived", status: "archived" },
  { href: "/itineraries?status=trashed", label: "Trash", status: "trashed" },
];

export default function ItinerariesSidebar({
  currentStatus,
}: {
  currentStatus: ItineraryListStatus;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const current = filters.find((filter) => filter.status === currentStatus) ?? filters[0];

  return (
    <aside className={styles.sidebar}>
      <ItineraryCreate variant="secondary" idPrefix="sidebar-create" />
      <nav className={styles.nav}>
        <ul className={styles.list}>
          {filters.map((filter) => (
            <li key={filter.status}>
              <Link
                href={filter.href}
                className={styles.link}
                aria-current={currentStatus === filter.status ? "page" : undefined}
              >
                {filter.label}
              </Link>
            </li>
          ))}
        </ul>

        <details ref={menuRef} className={styles.menu}>
          <summary className={styles.trigger}>
            <span className={styles.triggerLabel}>{current.label}</span>
            <span className={styles.chevron} aria-hidden="true" />
          </summary>
          <ul className={styles.menuList}>
            {filters.map((filter) => (
              <li key={filter.status}>
                <Link
                  href={filter.href}
                  className={styles.option}
                  aria-current={currentStatus === filter.status ? "page" : undefined}
                  onClick={() => {
                    if (filter.status === currentStatus) {
                      menuRef.current?.removeAttribute("open");
                    }
                  }}
                >
                  {filter.label}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      </nav>
    </aside>
  );
}
