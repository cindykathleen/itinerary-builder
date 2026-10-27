import Link from "next/link";
import { notFound } from "next/navigation";
import { executeGraphQL } from "@/lib/graphql/execute";
import { ActivityHighlightProvider } from "./ActivityHighlight";
import ActivitySidebar from "./ActivitySidebar";
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
      categories {
        id
        name
        color
        logistics
        stopId
      }
      stops {
        id
        name
      }
      activities {
        id
        name
        note
        categoryId
        stopId
        googlePlaceId
        googlePlaceName
        googlePlaceAddress
        inSidebar
        startDate
        startTime
        endTime
      }
    }
  }
`;

type ItineraryQuery = {
  itinerary: {
    id: string;
    name: string;
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
    categories: {
      id: string;
      name: string;
      color: string;
      logistics: boolean;
      stopId: string | null;
    }[];
    stops: {
      id: string;
      name: string;
    }[];
    activities: {
      id: string;
      name: string;
      note: string | null;
      categoryId: string | null;
      stopId: string | null;
      googlePlaceId: string | null;
      googlePlaceName: string | null;
      googlePlaceAddress: string | null;
      inSidebar: boolean;
      startDate: string | null;
      startTime: string | null;
      endTime: string | null;
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

  const categories = itinerary.categories.map((category) => ({
    id: category.id,
    name: category.name,
    color: category.color,
    logistics: category.logistics,
    stopId: category.stopId,
  }));
  const stops = itinerary.stops.map((stop) => ({
    id: stop.id,
    name: stop.name,
  }));
  const sidebarItems = itinerary.activities
    .filter((activity) => activity.inSidebar)
    .map((activity) => ({
      id: activity.id,
      name: activity.name,
      note: activity.note,
      categoryId: activity.categoryId,
      stopId: activity.stopId,
      googlePlaceId: activity.googlePlaceId,
      googlePlaceName: activity.googlePlaceName,
      googlePlaceAddress: activity.googlePlaceAddress,
      startDate: activity.startDate,
    }));

  return (
    <main className={`page ${styles.page}`}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <Link href="/itineraries" className={styles.back} aria-label="Back to itineraries">
            <span className={styles.backIcon} aria-hidden="true" />
          </Link>
          <h1 className={styles.title}>{itinerary.name}</h1>
        </div>
        <div className={styles.controls}>
          <ItineraryEdit
            itinerary={{
              id: itinerary.id,
              name: itinerary.name,
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

      <ActivityHighlightProvider>
      {view === "activities" ? (
        <ActivitySidebar
          itineraryId={itinerary.id}
          categories={categories}
          stops={stops}
          activities={sidebarItems}
        />
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
          categories={categories}
          stops={stops}
          daySettings={itinerary.daySettings.map((day) => ({
            date: day.date.slice(0, 10),
            heading: day.heading,
          }))}
          activities={itinerary.activities.map((activity) => ({
            id: activity.id,
            name: activity.name,
            color:
              categories.find((category) => category.id === activity.categoryId)?.color ??
              "#E0E6ED",
            inSidebar: activity.inSidebar,
            startDate: activity.startDate,
            startTime: activity.startTime,
            endTime: activity.endTime,
          }))}
        />
      ) : (
        <ItineraryScheduleSetup itineraryId={itinerary.id} />
      )}
      </ActivityHighlightProvider>
    </main>
  );
}
