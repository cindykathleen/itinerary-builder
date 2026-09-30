import { executeGraphQL } from "@/lib/graphql/execute";
import ItinerariesGrid from "./ItinerariesGrid";
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
        <ItinerariesGrid itineraries={itineraries} status={status} />
      </section>
    </main>
  );
}
