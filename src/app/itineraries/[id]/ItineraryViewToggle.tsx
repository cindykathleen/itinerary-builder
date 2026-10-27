"use client";

import { useRouter } from "next/navigation";
import styles from "./page.module.css";

type ItineraryView = "activities" | "map";

export default function ItineraryViewToggle({
  itineraryId,
  view,
}: {
  itineraryId: string;
  view: ItineraryView;
}) {
  const router = useRouter();

  const showActivities = () => {
    if (view !== "activities") {
      router.push(`/itineraries/${itineraryId}`);
    }
  };

  const showMap = () => {
    if (view !== "map") {
      router.push(`/itineraries/${itineraryId}?view=map`);
    }
  };

  return (
    <div className={styles.nav} role="group" aria-label="Itinerary views">
      <button
        type="button"
        aria-pressed={view === "activities"}
        onClick={showActivities}
      >
        Activities
      </button>
      <button
        type="button"
        aria-pressed={view === "map"}
        onClick={showMap}
      >
        Map
      </button>
    </div>
  );
}
