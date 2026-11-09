import Link from "next/link";
import type { ItineraryListStatus } from "./ItinerariesSidebar";
import ItineraryCardMenu from "./ItineraryCardMenu";
import styles from "./ItineraryCard.module.css";

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
    <article className={styles.card}>
      <div className={styles.header}>
        <h2 className={styles.title}>
          <Link href={`/itineraries/${itinerary.id}`} className={styles.titleLink}>
            {itinerary.name}
          </Link>
        </h2>
        <ItineraryCardMenu
          id={itinerary.id}
          name={itinerary.name}
          photoUrl={itinerary.photoUrl}
          status={status}
        />
      </div>

      <Link href={`/itineraries/${itinerary.id}`} className={styles.cover}>
        {itinerary.photoUrl ? (
          <img src={itinerary.photoUrl} alt="" />
        ) : (
          <div className={styles.placeholder} aria-hidden="true" />
        )}
      </Link>
    </article>
  );
}
