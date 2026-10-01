import Link from "next/link";
import type { ItineraryListStatus } from "./ItinerariesSidebar";
import ItineraryCardMenu from "./ItineraryCardMenu";

export type ItineraryCardData = {
  id: string;
  name: string;
  photoUrl: string | null;
};

export default function ItineraryCard({
  itinerary,
  status,
}: {
  itinerary: ItineraryCardData;
  status: ItineraryListStatus;
}) {
  return (
    <article>
      <Link href={`/itineraries/${itinerary.id}`}>
        {itinerary.photoUrl ? (
          <img src={itinerary.photoUrl} alt="" />
        ) : (
          <div aria-hidden="true" />
        )}
        <h2>{itinerary.name}</h2>
      </Link>

      <ItineraryCardMenu id={itinerary.id} name={itinerary.name} status={status} />
    </article>
  );
}
