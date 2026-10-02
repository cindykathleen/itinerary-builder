import { notFound } from "next/navigation";
import { executeGraphQL } from "@/lib/graphql/execute";
import ItineraryEdit from "./ItineraryEdit";
import ItineraryScheduleSetup from "./ItineraryScheduleSetup";
import ItineraryTimeline from "./ItineraryTimeline";
import ItineraryViewToggle from "./ItineraryViewToggle";
import styles from "./page.module.css";

const itineraryQuery = /* GraphQL */ `
  query Itinerary($id: ID!) {
    itinerary(id: $id) {
      id
      name
      destination
      dateStart
      dateEnd
      dayStart
      dayEnd
      timeInterval
      timeFormat
      scheduleConfigured
      daySettings {
        date
        heading
      }
    }
  }
`;

type ItineraryQuery = {
  itinerary: {
    id: string;
    name: string;
    destination: string;
    dateStart: string;
    dateEnd: string;
    dayStart: string;
    dayEnd: string;
    timeInterval: number;
    timeFormat: string;
    scheduleConfigured: boolean;
    daySettings: {
      date: string;
      heading: string | null;
    }[];
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
        <div className={styles.controls}>
          <ItineraryEdit
            itinerary={{
              id: itinerary.id,
              name: itinerary.name,
              destination: itinerary.destination,
              dateStart: itinerary.dateStart,
              dateEnd: itinerary.dateEnd,
              dayStart: itinerary.dayStart,
              dayEnd: itinerary.dayEnd,
              timeInterval: itinerary.timeInterval,
            }}
          />
          <ItineraryViewToggle itineraryId={itinerary.id} view={view} />
        </div>
      </header>

      {view === "activities" ? (
        <section className={styles.side} aria-label="Activities" />
      ) : (
        <section className={styles.side} aria-label="Map" />
      )}

      {itinerary.scheduleConfigured ? (
        <ItineraryTimeline
          itineraryId={itinerary.id}
          dateStart={itinerary.dateStart}
          dateEnd={itinerary.dateEnd}
          dayStart={itinerary.dayStart}
          dayEnd={itinerary.dayEnd}
          timeInterval={itinerary.timeInterval}
          timeFormat={itinerary.timeFormat}
          daySettings={itinerary.daySettings}
        />
      ) : (
        <ItineraryScheduleSetup itineraryId={itinerary.id} />
      )}
    </main>
  );
}
