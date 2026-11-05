"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useActivityHighlight } from "./ActivityHighlight";
import { loadGoogleMaps } from "./load-google-maps";
import styles from "./page.module.css";

export type MapActivity = {
  id: string;
  name: string;
  onTimeline: boolean;
};

export type MapPlace = {
  id: string;
  googlePlaceId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  color: string;
  activityIds: string[];
  activities: MapActivity[];
};

const TEXT_PRIMARY = "#1A202C";
const WHITE = "#FFFFFF";

function pinGlyphColor(color: string) {
  const digits = color.slice(1);
  const red = Number.parseInt(digits.slice(0, 2), 16);
  const green = Number.parseInt(digits.slice(2, 4), 16);
  const blue = Number.parseInt(digits.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;

  return luminance > 0.62 ? TEXT_PRIMARY : WHITE;
}

function pinBorderColor(color: string) {
  const digits = color.slice(1);
  const channel = (start: number) =>
    Math.round(Number.parseInt(digits.slice(start, start + 2), 16) * 0.5)
      .toString(16)
      .padStart(2, "0");

  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

type GoogleLatLng = {
  lat: number;
  lng: number;
};

type GoogleMap = {
  fitBounds: (bounds: GoogleBounds, padding?: number) => void;
  getZoom: () => number | undefined;
  panTo: (position: GoogleLatLng) => void;
  setCenter: (position: GoogleLatLng) => void;
  setZoom: (zoom: number) => void;
};

type GoogleBounds = {
  extend: (position: GoogleLatLng) => void;
};

type GoogleMarker = {
  map: GoogleMap | null;
  title: string;
  addListener: (event: string, handler: () => void) => void;
};

type GooglePin = {
  element: HTMLElement;
  background: string;
  borderColor: string;
  glyphColor: string;
};

type GoogleInfoWindow = {
  close: () => void;
  setContent: (content: HTMLElement) => void;
  setHeaderContent: (content: HTMLElement) => void;
  open: (options: { map: GoogleMap; anchor: GoogleMarker }) => void;
};

type MapsLibrary = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  InfoWindow: new () => GoogleInfoWindow;
};

type MarkerLibrary = {
  AdvancedMarkerElement: new (options: {
    map: GoogleMap;
    position: GoogleLatLng;
    title: string;
    content: HTMLElement;
  }) => GoogleMarker;
  PinElement: new (options: {
    background: string;
    borderColor: string;
    glyphColor: string;
    scale: number;
  }) => GooglePin;
};

function placeOnTimeline(place: MapPlace) {
  return place.activities.length > 0 && place.activities.every((activity) => activity.onTimeline);
}

function pinColors(place: MapPlace) {
  if (placeOnTimeline(place)) {
    return {
      background: place.color,
      borderColor: pinBorderColor(place.color),
      glyphColor: pinGlyphColor(place.color),
    };
  }

  return {
    background: WHITE,
    borderColor: pinBorderColor(place.color),
    glyphColor: pinBorderColor(place.color),
  };
}

function pinTitle(place: MapPlace) {
  const scheduled = place.activities.filter((activity) => activity.onTimeline).length;

  if (scheduled === 0) {
    return `${place.name}, not on the timeline`;
  }

  if (scheduled === place.activities.length) {
    return `${place.name}, on the timeline`;
  }

  return place.name;
}

function paintPin(pin: GooglePin, marker: GoogleMarker, place: MapPlace) {
  const colors = pinColors(place);
  pin.background = colors.background;
  pin.borderColor = colors.borderColor;
  pin.glyphColor = colors.glyphColor;
  pin.element.dataset.onTimeline = placeOnTimeline(place) ? "true" : "false";
  marker.title = pinTitle(place);
}

function markerContent(place: MapPlace, onAdd: (activityId: string) => void) {
  const name = document.createElement("h4");
  const body = document.createElement("div");
  const address = document.createElement("p");
  name.className = styles.mapPopupTitle;
  address.className = styles.mapPopupAddress;
  name.textContent = place.name;
  address.textContent = place.address;
  body.append(address);

  if (place.activities.length > 0) {
    const list = document.createElement("ul");
    list.className = styles.mapPopupActivities;

    for (const activity of place.activities) {
      const item = document.createElement("li");

      if (activity.onTimeline) {
        item.className = `${styles.mapPopupActivity} ${styles.mapPopupActivityScheduled}`;
        item.textContent = activity.name;
      } else {
        const add = document.createElement("button");
        add.type = "button";
        add.className = `primary ${styles.mapPopupAdd}`;
        add.textContent = "Add to itinerary";
        add.setAttribute("aria-label", `Add ${activity.name} to itinerary`);
        add.addEventListener("pointerdown", (event) => event.stopPropagation());
        add.addEventListener("mousedown", (event) => event.stopPropagation());
        add.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          onAdd(activity.id);
        });
        item.append(add);
      }

      list.append(item);
    }

    body.append(list);
  }

  return { name, body };
}

export default function ItineraryMap({
  apiKey,
  places,
}: {
  apiKey: string;
  places: MapPlace[];
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markersRef = useRef(
    new Map<string, { element: HTMLElement; position: GoogleLatLng; pin: GooglePin; marker: GoogleMarker }>(),
  );
  const placesRef = useRef(places);
  const hoverPlaceRef = useRef<(placeId: string | null) => void>(() => {});
  const highlight = useActivityHighlight();
  const [error, setError] = useState("");
  const [mapReady, setMapReady] = useState(0);
  const placeKey = places
    .map((place) => `${place.id}:${place.latitude}:${place.longitude}:${place.color}`)
    .join("|");

  useLayoutEffect(() => {
    placesRef.current = places;
    hoverPlaceRef.current = highlight?.setHoveredPlaceId ?? (() => {});
  });

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!apiKey || !canvas) {
      return;
    }

    let cancelled = false;
    const markers: GoogleMarker[] = [];
    const markerCleanups: (() => void)[] = [];
    const previousAuthFailure = window.gm_authFailure;

    window.gm_authFailure = () => {
      if (!cancelled) {
        setError("Google Maps could not load. Enable the Maps JavaScript API for this key.");
      }
    };

    loadGoogleMaps(apiKey)
      .then(async () => {
        if (cancelled || !window.google?.maps) {
          return;
        }

        const maps = (await window.google.maps.importLibrary("maps")) as unknown as MapsLibrary;
        const markerLibrary = (await window.google.maps.importLibrary(
          "marker",
        )) as unknown as MarkerLibrary;
        const LatLngBounds = (
          window.google.maps as unknown as { LatLngBounds: new () => GoogleBounds }
        ).LatLngBounds;

        if (cancelled) {
          return;
        }

        const map = new maps.Map(canvas, {
          center: { lat: 20, lng: 0 },
          zoom: 2,
          mapId: "DEMO_MAP_ID",
          mapTypeControl: false,
          streetViewControl: false,
        });
        const infoWindow = new maps.InfoWindow();
        const bounds = new LatLngBounds();

        for (const place of placesRef.current) {
          const position = { lat: place.latitude, lng: place.longitude };
          const colors = pinColors(place);
          const pin = new markerLibrary.PinElement({
            background: colors.background,
            borderColor: colors.borderColor,
            glyphColor: colors.glyphColor,
            scale: 1.15,
          });
          pin.element.classList.add(styles.mapPin);
          const marker = new markerLibrary.AdvancedMarkerElement({
            map,
            position,
            title: pinTitle(place),
            content: pin.element,
          });
          paintPin(pin, marker, place);
          const showPlace = () => hoverPlaceRef.current(place.googlePlaceId);
          const hidePlace = () => hoverPlaceRef.current(null);
          pin.element.addEventListener("mouseenter", showPlace);
          pin.element.addEventListener("mouseleave", hidePlace);
          markerCleanups.push(() => {
            pin.element.removeEventListener("mouseenter", showPlace);
            pin.element.removeEventListener("mouseleave", hidePlace);
          });

          marker.addListener("click", () => {
            const current =
              placesRef.current.find((item) => item.googlePlaceId === place.googlePlaceId) ?? place;
            const content = markerContent(current, (activityId) => {
              window.dispatchEvent(new CustomEvent("activity-add-to-itinerary", { detail: activityId }));
              infoWindow.close();
            });
            infoWindow.setHeaderContent(content.name);
            infoWindow.setContent(content.body);
            infoWindow.open({ map, anchor: marker });
          });
          markers.push(marker);
          markersRef.current.set(place.googlePlaceId, {
            element: pin.element,
            position,
            pin,
            marker,
          });
          bounds.extend(position);
        }

        if (cancelled) {
          markersRef.current.clear();

          for (const marker of markers) {
            marker.map = null;
          }

          return;
        }

        mapRef.current = map;
        setMapReady((ready) => ready + 1);

        const placed = placesRef.current;

        if (placed.length === 1) {
          map.setCenter({ lat: placed[0].latitude, lng: placed[0].longitude });
          map.setZoom(14);
        } else if (placed.length > 1) {
          map.fitBounds(bounds, 48);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Google Maps could not load.");
        }
      });

    return () => {
      cancelled = true;
      window.gm_authFailure = previousAuthFailure;
      mapRef.current = null;
      markersRef.current.clear();

      for (const cleanup of markerCleanups) {
        cleanup();
      }

      for (const marker of markers) {
        marker.map = null;
      }
    };
  }, [apiKey, placeKey]);

  useEffect(() => {
    for (const place of places) {
      const record = markersRef.current.get(place.googlePlaceId);

      if (record) {
        paintPin(record.pin, record.marker, place);
      }
    }
  }, [mapReady, places]);

  useEffect(() => {
    const activePlaceId =
      highlight?.hoveredPlaceId ??
      places.find((place) => highlight?.hoveredId && place.activityIds.includes(highlight.hoveredId))
        ?.googlePlaceId ??
      null;

    for (const [placeId, marker] of markersRef.current) {
      marker.element.classList.toggle(styles.mapPinActive, placeId === activePlaceId);
    }

    const map = mapRef.current;
    const marker = activePlaceId ? markersRef.current.get(activePlaceId) : undefined;

    if (!map || !marker || highlight?.source !== "timeline") {
      return;
    }

    map.panTo(marker.position);

    if ((map.getZoom() ?? 0) < 14) {
      map.setZoom(14);
    }
  }, [highlight?.hoveredId, highlight?.hoveredPlaceId, highlight?.source, mapReady, places]);

  if (!apiKey) {
    return <p className={styles.mapStatus}>Google Maps is not configured.</p>;
  }

  return (
    <>
      <div ref={canvasRef} className={styles.mapCanvas} />
      {error ? <p className={styles.mapStatus}>{error}</p> : null}
      {!error && places.length === 0 ? (
        <p className={styles.mapNote}>Link an activity to Google Maps to see it here.</p>
      ) : null}
    </>
  );
}
