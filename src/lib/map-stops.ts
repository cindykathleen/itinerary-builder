export type StopMapActivity = {
  id: string;
  name: string;
  stopId: string | null;
  onTimeline: boolean;
  createdAt: string;
  color: string;
};

export type StopMapPlace = {
  id: string;
  googlePlaceId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  activities: StopMapActivity[];
};

export type FilteredMapPlace = {
  id: string;
  googlePlaceId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  color: string;
  activityIds: string[];
  activities: {
    id: string;
    name: string;
    onTimeline: boolean;
  }[];
};

const FALLBACK_COLOR = "#E0E6ED";

function byCreatedAt(left: StopMapActivity, right: StopMapActivity) {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function byInfoWindow(left: StopMapActivity, right: StopMapActivity) {
  return (
    Number(left.onTimeline) - Number(right.onTimeline) ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  );
}

export function placesForStop(places: StopMapPlace[], stopId: string | null): FilteredMapPlace[] {
  return places.flatMap((place) => {
    const matching = place.activities.filter(
      (activity) => stopId === null || activity.stopId === stopId,
    );

    if (matching.length === 0) {
      return [];
    }

    const earliest = [...matching].sort(byCreatedAt)[0];
    const activities = [...matching].sort(byInfoWindow);

    return [
      {
        id: place.id,
        googlePlaceId: place.googlePlaceId,
        name: place.name,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        color: earliest.color || FALLBACK_COLOR,
        activityIds: activities.map((activity) => activity.id),
        activities: activities.map((activity) => ({
          id: activity.id,
          name: activity.name,
          onTimeline: activity.onTimeline,
        })),
      },
    ];
  });
}
