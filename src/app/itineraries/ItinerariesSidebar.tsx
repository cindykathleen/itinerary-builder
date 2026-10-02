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
      </nav>
    </aside>
  );
}
