import Link from "next/link";
import ItineraryCreate from "./ItineraryCreate";

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
    <aside>
      <ItineraryCreate />
      <nav>
        <ul>
          {filters.map((filter) => (
            <li key={filter.status}>
              <Link
                href={filter.href}
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
