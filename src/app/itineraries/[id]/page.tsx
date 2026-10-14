import { notFound } from "next/navigation";
import { executeGraphQL } from "@/lib/graphql/execute";
import ActivityAdd from "./ActivityAdd";
import CategoryItem from "./CategoryItem";
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
      categories {
        id
        name
        color
      }
      activities {
        id
        name
        note
        categoryId
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
    categories: {
      id: string;
      name: string;
      color: string;
    }[];
    activities: {
      id: string;
      name: string;
      note: string | null;
      categoryId: string | null;
      inSidebar: boolean;
      startDate: string | null;
      startTime: string | null;
      endTime: string | null;
    }[];
  } | null;
};

type ItineraryView = "activities" | "map";

function sidebarActivities(
  activities: {
    id: string;
    name: string;
    note: string | null;
    startDate: string | null;
  }[],
) {
  return [...activities]
    .sort(
      (left, right) => Number(left.startDate !== null) - Number(right.startDate !== null),
    )
    .map((activity) => ({
      id: activity.id,
      name: activity.name,
      note: activity.note,
      scheduled: activity.startDate !== null,
    }));
}

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
  }));
  const categoryIds = new Set(itinerary.categories.map((category) => category.id));
  const sidebarItems = itinerary.activities.filter((activity) => activity.inSidebar);
  const uncategorized = sidebarActivities(
    sidebarItems.filter(
      (activity) => activity.categoryId === null || !categoryIds.has(activity.categoryId),
    ),
  );

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
        <section className={`${styles.side} ${styles.activities}`} aria-label="Activities">
          <header className={styles.activitiesHeader}>
            <h2 className={styles.activitiesTitle}>Activities</h2>
            <ActivityAdd itineraryId={itinerary.id} categories={categories} />
          </header>
          {itinerary.categories.length > 0 || uncategorized.length > 0 ? (
            <ul className={styles.categoryList}>
              {itinerary.categories.map((category) => (
                <CategoryItem
                  key={category.id}
                  itineraryId={itinerary.id}
                  id={category.id}
                  name={category.name}
                  color={category.color}
                  categories={categories}
                  activities={sidebarActivities(
                    sidebarItems.filter((activity) => activity.categoryId === category.id),
                  )}
                />
              ))}
              {uncategorized.length > 0 ? (
                <CategoryItem
                  key="uncategorized"
                  itineraryId={itinerary.id}
                  id="uncategorized"
                  name="Uncategorized"
                  color="var(--surface)"
                  readOnly
                  categories={categories}
                  activities={uncategorized}
                />
              ) : null}
            </ul>
          ) : null}
        </section>
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
    </main>
  );
}
