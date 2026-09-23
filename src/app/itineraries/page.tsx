import { executeGraphQL } from "@/lib/graphql/execute";
import ItinerariesSidebar, { type ItineraryListStatus } from "./ItinerariesSidebar";

const itinerariesQuery = /* GraphQL */ `
  query MyItineraries($status: ItineraryStatus!) {
    itineraries(status: $status) {
      id
      name
      destination
      dateStart
      dateEnd
      status
    }
  }
`;

type ItinerariesQuery = {
  itineraries: {
    id: string;
    name: string;
    destination: string;
    dateStart: string;
    dateEnd: string;
    status: ItineraryListStatus;
  }[];
};

const headings: Record<ItineraryListStatus, string> = {
  active: "My itineraries",
  archived: "Archived",
  trashed: "Trash",
};

const emptyMessages: Record<ItineraryListStatus, string> = {
  active: "Your itineraries will appear here.",
  archived: "No archived itineraries.",
  trashed: "No itineraries in trash.",
};

function parseStatus(
  value: string | string[] | undefined,
): ItineraryListStatus {
  const status = Array.isArray(value) ? value[0] : value;

  if (status === "archived" || status === "trashed") {
    return status;
  }

  return "active";
}

export default async function ItinerariesPage({
  searchParams,
}: PageProps<"/itineraries">) {
  const { status: statusParam } = await searchParams;
  const status = parseStatus(statusParam);
  const { itineraries } = await executeGraphQL<ItinerariesQuery>(
    itinerariesQuery,
    { status },
  );

  return (
    <main>
      <ItinerariesSidebar currentStatus={status} />

      <section>
        <h1>{headings[status]}</h1>

        {itineraries.length === 0 ? (
          <p>{emptyMessages[status]}</p>
        ) : (
          <ul>
            {itineraries.map((itinerary) => (
              <li key={itinerary.id}>
                <h2>{itinerary.name}</h2>
                <p>{itinerary.destination}</p>
                <p>
                  {itinerary.dateStart} – {itinerary.dateEnd}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
