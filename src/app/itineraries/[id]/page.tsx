export default async function ItineraryPage({
  params,
}: PageProps<"/itineraries/[id]">) {
  const { id } = await params;

  return (
    <main>
      <h1>Itinerary</h1>
      <p>{id}</p>
    </main>
  );
}
