import Link from "next/link";
import { notFound } from "next/navigation";
import { executeGraphQL } from "@/lib/graphql/execute";
import { ActivityHighlightProvider } from "./ActivityHighlight";
import ActivitySidebar from "./ActivitySidebar";
import ItineraryEdit from "./ItineraryEdit";
import ItineraryMap from "./ItineraryMap";
import ItineraryScheduleSetup from "./ItineraryScheduleSetup";
import ItinerarySections from "./ItinerarySections";
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
      planningMode
      sections {
        id
        name
        position
      }
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
      googlePlaces {
        id
        googlePlaceId
        name
        address
        latitude
        longitude
        color
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
        sectionId
        sectionDate
        position
        sidebarPosition
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
    planningMode: "timeline" | "sections";
    sections: {
      id: string;
      name: string;
      position: number;
    }[];
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
    googlePlaces: {
      id: string;
      googlePlaceId: string;
      name: string;
      address: string;
      latitude: number;
      longitude: number;
      color: string;
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
      sectionId: string | null;
      sectionDate: string | null;
      position: number | null;
      sidebarPosition: number | null;
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
      sidebarPosition: activity.sidebarPosition,
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
        <section className={`${styles.side} ${styles.mapPanel}`} aria-label="Map">
          <ItineraryMap
            apiKey={process.env.GOOGLE_PLACES_API_KEY ?? ""}
            places={itinerary.googlePlaces.map((place) => {
              const activities = itinerary.activities
                .filter((activity) => activity.googlePlaceId === place.googlePlaceId)
                .map((activity) => ({
                  id: activity.id,
                  name: activity.name,
                  onTimeline: Boolean(
                    (activity.startDate && activity.startTime && activity.endTime) ||
                      activity.sectionId,
                  ),
                }))
                .sort(
                  (left, right) =>
                    Number(left.onTimeline) - Number(right.onTimeline) ||
                    left.name.localeCompare(right.name),
                );

              return {
                id: place.id,
                googlePlaceId: place.googlePlaceId,
                name: place.name,
                address: place.address,
                latitude: Number(place.latitude),
                longitude: Number(place.longitude),
                color: place.color,
                activityIds: activities.map((activity) => activity.id),
                activities,
              };
            })}
          />
        </section>
      )}

      {itinerary.scheduleConfigured && itinerary.planningMode === "sections" ? (
        <ItinerarySections
          itineraryId={itinerary.id}
          dateStart={itinerary.dateStart}
          dateEnd={itinerary.dateEnd}
          sections={itinerary.sections.map((section) => ({
            id: section.id,
            name: section.name,
            position: section.position,
          }))}
          categories={categories}
          stops={stops}
          daySettings={itinerary.daySettings.map((day) => ({
            date: day.date.slice(0, 10),
            heading: day.heading,
          }))}
          activities={itinerary.activities.map((activity) => ({
            id: activity.id,
            name: activity.name,
            note: activity.note,
            categoryId: activity.categoryId,
            stopId: activity.stopId,
            googlePlaceId: activity.googlePlaceId,
            googlePlaceName: activity.googlePlaceName,
            googlePlaceAddress: activity.googlePlaceAddress,
            color:
              categories.find((category) => category.id === activity.categoryId)?.color ??
              "#E0E6ED",
            inSidebar: activity.inSidebar,
            sectionId: activity.sectionId,
            sectionDate: activity.sectionDate?.slice(0, 10) ?? null,
            position: activity.position,
          }))}
        />
      ) : itinerary.scheduleConfigured ? (
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
            note: activity.note,
            categoryId: activity.categoryId,
            stopId: activity.stopId,
            googlePlaceId: activity.googlePlaceId,
            googlePlaceName: activity.googlePlaceName,
            googlePlaceAddress: activity.googlePlaceAddress,
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
