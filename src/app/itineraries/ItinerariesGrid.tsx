import type { ItineraryListStatus } from "./ItinerariesSidebar";
import ItineraryCard, { type ItineraryCardData } from "./ItineraryCard";
import styles from "./ItinerariesGrid.module.css";

const emptyMessages: Record<ItineraryListStatus, string> = {
  active: "Your itineraries will appear here.",
  archived: "No archived itineraries.",
  trashed: "No itineraries in trash.",
};

export default function ItinerariesGrid({
  itineraries,
  status,
}: {
  itineraries: ItineraryCardData[];
  status: ItineraryListStatus;
}) {
  if (itineraries.length === 0) {
    return (
      <div className={styles.empty}>
        <h2>{emptyMessages[status]}</h2>
      </div>
    );
  }

  return (
    <ul className={styles.grid}>
      {itineraries.map((itinerary) => (
        <li key={itinerary.id}>
          <ItineraryCard itinerary={itinerary} status={status} />
        </li>
      ))}
    </ul>
  );
}
