import type { ItineraryListStatus } from "./ItinerariesSidebar";

export type ItineraryCard = {
  id: string;
  name: string;
  destination: string;
  dateStart: string;
  dateEnd: string;
};

const emptyMessages: Record<ItineraryListStatus, string> = {
  active: "Your itineraries will appear here.",
  archived: "No archived itineraries.",
  trashed: "No itineraries in trash.",
};

export default function ItinerariesGrid({
  itineraries,
  status,
}: {
  itineraries: ItineraryCard[];
  status: ItineraryListStatus;
}) {
  if (itineraries.length === 0) {
    return <p>{emptyMessages[status]}</p>;
  }

  return (
    <ul>
      {itineraries.map((itinerary) => (
        <li key={itinerary.id}>
          <article>
            <h2>{itinerary.name}</h2>
            <p>{itinerary.destination}</p>
            <p>
              {itinerary.dateStart} – {itinerary.dateEnd}
            </p>
          </article>
        </li>
      ))}
    </ul>
  );
}
