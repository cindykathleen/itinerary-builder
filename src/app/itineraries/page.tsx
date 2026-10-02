import { executeGraphQL } from "@/lib/graphql/execute";
import ItinerariesGrid from "./ItinerariesGrid";
import ItinerariesSidebar, { type ItineraryListStatus } from "./ItinerariesSidebar";
import ItineraryCreate from "./ItineraryCreate";
import styles from "./page.module.css";

const itinerariesQuery = /* GraphQL */ `
  query MyItineraries($status: ItineraryStatus!) {
    itineraries(status: $status) {
      id
      name
      photoUrl
    }
  }
`;

type ItinerariesQuery = {
  itineraries: {
    id: string;
    name: string;
    photoUrl: string | null;
  }[];
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
    <main className={`page ${styles.page}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>My Itineraries</h1>
        <ItineraryCreate variant="primary" idPrefix="header-create" />
      </header>

      <ItinerariesSidebar currentStatus={status} />

      <section className={styles.board}>
        <ItinerariesGrid itineraries={itineraries} status={status} />
      </section>
    </main>
  );
}
