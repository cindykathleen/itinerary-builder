"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
const PLACE_CARD_TAG = "gmp-internal-use-2d-map-place-details-compact";

const placeCardStyles: Record<string, string> = {
  [PLACE_CARD_TAG]: `
    :host {
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      overflow: visible !important;
    }

    .outer-container,
    :host([orientation="horizontal" i]) .outer-container,
    .container.place-compact,
    .container.place-compact.horizontal:not(.error, .empty) {
      padding: 0 !important;
    }

    .name-and-address {
      gap: 0 !important;
    }
  `,
  "gmp-place-name": `
    span {
      color: var(--text-primary) !important;
      font-family: Arial, Helvetica, sans-serif !important;
      font-size: 18px !important;
      font-weight: 400 !important;
      font-style: normal !important;
      line-height: 24px !important;
      letter-spacing: normal !important;
    }
  `,
  "gmp-place-address": `
    span {
      color: var(--text-primary) !important;
      font-family: Arial, Helvetica, sans-serif !important;
      font-size: 16px !important;
      font-weight: 400 !important;
      font-style: normal !important;
      line-height: 24px !important;
      letter-spacing: normal !important;
    }
  `,
};

function installPlaceCardStyles() {
  const elementPrototype = Element.prototype as typeof Element.prototype & {
    __itineraryPlaceCardPatch?: boolean;
  };

  if (elementPrototype.__itineraryPlaceCardPatch) {
    return;
  }

  elementPrototype.__itineraryPlaceCardPatch = true;
  const attachShadow = elementPrototype.attachShadow;

  elementPrototype.attachShadow = function (init: ShadowRootInit) {
    const root = attachShadow.call(this, init);
    const css = placeCardStyles[this.localName];

    if (css) {
      const style = document.createElement("style");
      style.dataset.placeCard = this.localName;
      style.textContent = css;
      root.append(style);
    }

    return root;
  };
}

if (typeof window !== "undefined") {
  installPlaceCardStyles();
}

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
    borderColor: place.color,
    glyphColor: place.color,
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

function googleMapsHref(placeId: string, name: string | null) {
  const params = new URLSearchParams({
    api: "1",
    query: name?.trim() || "Google Maps",
    query_place_id: placeId,
  });

  return `https://www.google.com/maps/search/?${params.toString()}`;
}

function externalLinkIcon() {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  path.setAttribute("fill", "currentColor");
  path.setAttribute(
    "d",
    "M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7ZM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7Z",
  );
  icon.append(path);
  return icon;
}

function markerContent(place: MapPlace, onAdd: (activityId: string) => void) {
  const header = document.createElement("div");
  const name = document.createElement("h4");
  const actions = document.createElement("div");
  const link = document.createElement("a");
  const body = document.createElement("div");
  const address = document.createElement("p");
  header.className = styles.mapPopupHeader;
  actions.className = styles.mapPopupActions;
  name.className = styles.mapPopupTitle;
  name.textContent = place.name;
  link.className = styles.mapPopupExternal;
  link.href = googleMapsHref(place.googlePlaceId, place.name);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", "Google Map");
  link.append(externalLinkIcon());
  link.addEventListener("pointerdown", (event) => event.stopPropagation());
  link.addEventListener("mousedown", (event) => event.stopPropagation());
  actions.append(link);
  header.append(name, actions);
  address.className = styles.mapPopupAddress;
  address.textContent = place.address;
  body.append(address);

  const unscheduled = place.activities.filter((activity) => !activity.onTimeline);

  if (unscheduled.length > 0) {
    const list = document.createElement("ul");
    list.className = styles.mapPopupActivities;

    for (const activity of unscheduled) {
      const item = document.createElement("li");
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
      list.append(item);
    }

    body.append(list);
  }

  return { header, body };
}

function attachCloseButton(header: HTMLElement) {
  const actions = header.querySelector(`.${styles.mapPopupActions}`);
  const row = header.closest(".gm-style-iw-chr");
  const closeButton = row?.querySelector(".gm-ui-hover-effect");
  const target = actions ?? header;

  if (closeButton && closeButton.parentElement !== target) {
    target.append(closeButton);
    return true;
  }

  return closeButton?.parentElement === target;
}

function MapStopSwitcher({
  itineraryId,
  stops,
  stopId,
}: {
  itineraryId: string;
  stops: { id: string; name: string }[];
  stopId: string | null;
}) {
  const router = useRouter();

  const select = (next: string | null) => {
    const params = new URLSearchParams({ view: "map" });

    if (next) {
      params.set("stop", next);
    }

    router.push(`/itineraries/${itineraryId}?${params.toString()}`);
  };

  return (
    <div className={styles.mapStops} role="group" aria-label="Stops">
      <button type="button" aria-pressed={stopId === null} onClick={() => select(null)}>
        All
      </button>
      {stops.map((stop) => (
        <button
          key={stop.id}
          type="button"
          aria-pressed={stopId === stop.id}
          onClick={() => select(stop.id)}
        >
          {stop.name}
        </button>
      ))}
    </div>
  );
}

export default function ItineraryMap({
  apiKey,
  itineraryId,
  stops,
  stopId,
  places,
}: {
  apiKey: string;
  itineraryId: string;
  stops: { id: string; name: string }[];
  stopId: string | null;
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
            infoWindow.setHeaderContent(content.header);
            infoWindow.setContent(content.body);
            infoWindow.open({ map, anchor: marker });

            if (!attachCloseButton(content.header)) {
              requestAnimationFrame(() => {
                if (!attachCloseButton(content.header)) {
                  requestAnimationFrame(() => attachCloseButton(content.header));
                }
              });
            }
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
    return (
      <>
        <MapStopSwitcher itineraryId={itineraryId} stops={stops} stopId={stopId} />
        <div className={styles.mapStage}>
          <p className={styles.mapStatus}>Google Maps is not configured.</p>
        </div>
      </>
    );
  }

  const emptyMessage = stopId
    ? "No places on this stop yet."
    : "Link an activity to Google Maps to see it here.";

  return (
    <>
      <MapStopSwitcher itineraryId={itineraryId} stops={stops} stopId={stopId} />
      <div className={styles.mapStage}>
        <div ref={canvasRef} className={styles.mapCanvas} />
        {error ? <p className={styles.mapStatus}>{error}</p> : null}
        {!error && places.length === 0 ? <p className={styles.mapNote}>{emptyMessage}</p> : null}
      </div>
    </>
  );
}
