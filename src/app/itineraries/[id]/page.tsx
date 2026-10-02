import { notFound } from "next/navigation";
import { executeGraphQL } from "@/lib/graphql/execute";
import ItineraryScheduleSetup from "./ItineraryScheduleSetup";
import ItineraryViewToggle from "./ItineraryViewToggle";
import styles from "./page.module.css";

const itineraryQuery = /* GraphQL */ `
  query Itinerary($id: ID!) {
    itinerary(id: $id) {
      id
      name
      scheduleConfigured
    }
  }
`;

type ItineraryQuery = {
  itinerary: {
    id: string;
    name: string;
    scheduleConfigured: boolean;
  } | null;
};

type ItineraryView = "activities" | "map";

function parseView(value: string | string[] | undefined): ItineraryView {
  const view = Array.isArray(value) ? value[0] : value;

  if (view === "map") {
    return "map";
  }

  return "activities";
}

export default async function ItineraryPage({
  params,
  searchParams,
}: PageProps<"/itineraries/[id]">) {
  const { id } = await params;
  const { view: viewParam } = await searchParams;
  const view = parseView(viewParam);
  const { itinerary } = await executeGraphQL<ItineraryQuery>(itineraryQuery, {
    id,
  });

  if (!itinerary) {
    notFound();
  }

  return (
    <main className={`page ${styles.page}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>{itinerary.name}</h1>
        <ItineraryViewToggle itineraryId={itinerary.id} view={view} />
      </header>

      {view === "activities" ? (
        <section className={styles.side} aria-label="Activities" />
      ) : (
        <section className={styles.side} aria-label="Map" />
      )}

      {itinerary.scheduleConfigured ? null : (
        <ItineraryScheduleSetup itineraryId={itinerary.id} />
      )}
    </main>
  );
}
