export const googlePlaceFixtures = [
  {
    placeId: "fixture-park",
    name: "Fixture Park",
    address: "1 Fixture Way",
    latitude: 35.0116,
    longitude: 135.7681,
  },
  {
    placeId: "fixture-hotel",
    name: "Fixture Hotel",
    address: "2 Fixture Way",
    latitude: 35.0216,
    longitude: 135.7781,
  },
];

export function fixtureSuggestions(query: string) {
  const needle = query.trim().toLowerCase();

  return googlePlaceFixtures
    .filter(
      (place) =>
        place.name.toLowerCase().includes(needle) || place.address.toLowerCase().includes(needle),
    )
    .map(({ placeId, name, address }) => ({ placeId, name, address }));
}

export function fixturePlace(placeId: string) {
  return googlePlaceFixtures.find((place) => place.placeId === placeId) ?? null;
}
