import { executeGraphQL } from "@/lib/graphql/execute";

const itinerariesQuery = /* GraphQL */ `
  query MyItineraries {
    itineraries {
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
    status: "active" | "archived" | "trashed";
  }[];
};

export default async function ItinerariesPage() {
  const { itineraries } = await executeGraphQL<ItinerariesQuery>(itinerariesQuery);

  return (
    <main>
      <h1>My itineraries</h1>

      {itineraries.length === 0 ? (
        <p>Your itineraries will appear here.</p>
      ) : (
        <ul>
          {itineraries.map((itinerary) => (
            <li key={itinerary.id}>
              <h2>{itinerary.name}</h2>
              <p>{itinerary.destination}</p>
              <p>
                {itinerary.dateStart} – {itinerary.dateEnd}
              </p>
              <p>{itinerary.status}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
