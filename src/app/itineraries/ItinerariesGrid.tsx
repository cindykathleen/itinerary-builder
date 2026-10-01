import type { ItineraryListStatus } from "./ItinerariesSidebar";
import ItineraryCard, { type ItineraryCardData } from "./ItineraryCard";

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
    return <p>{emptyMessages[status]}</p>;
  }

  return (
    <ul>
      {itineraries.map((itinerary) => (
        <li key={itinerary.id}>
          <ItineraryCard itinerary={itinerary} status={status} />
        </li>
      ))}
    </ul>
  );
}
