"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "./load-google-maps";
import styles from "./page.module.css";

export type MapPlace = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  color: string;
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
  setCenter: (position: GoogleLatLng) => void;
  setZoom: (zoom: number) => void;
};

type GoogleBounds = {
  extend: (position: GoogleLatLng) => void;
};

type GoogleMarker = {
  map: GoogleMap | null;
  addListener: (event: string, handler: () => void) => void;
};

type GoogleInfoWindow = {
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
  }) => { element: HTMLElement };
};

function markerContent(place: MapPlace) {
  const name = document.createElement("h4");
  const address = document.createElement("p");
  name.className = styles.mapPopupTitle;
  address.className = styles.mapPopupAddress;
  name.textContent = place.name;
  address.textContent = place.address;
  return { name, address };
}

export default function ItineraryMap({
  apiKey,
  places,
}: {
  apiKey: string;
  places: MapPlace[];
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const placeKey = places
    .map((place) => `${place.id}:${place.latitude}:${place.longitude}:${place.color}`)
    .join("|");

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!apiKey || !canvas) {
      return;
    }

    let cancelled = false;
    const markers: GoogleMarker[] = [];
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

        for (const place of places) {
          const position = { lat: place.latitude, lng: place.longitude };
          const pin = new markerLibrary.PinElement({
            background: place.color,
            borderColor: pinBorderColor(place.color),
            glyphColor: pinGlyphColor(place.color),
            scale: 1.15,
          });
          pin.element.classList.add(styles.mapPin);
          const marker = new markerLibrary.AdvancedMarkerElement({
            map,
            position,
            title: place.name,
            content: pin.element,
          });

          marker.addListener("click", () => {
            const content = markerContent(place);
            infoWindow.setHeaderContent(content.name);
            infoWindow.setContent(content.address);
            infoWindow.open({ map, anchor: marker });
          });
          markers.push(marker);
          bounds.extend(position);
        }

        if (places.length === 1) {
          map.setCenter({ lat: places[0].latitude, lng: places[0].longitude });
          map.setZoom(14);
        } else if (places.length > 1) {
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

      for (const marker of markers) {
        marker.map = null;
      }
    };
  }, [apiKey, placeKey, places]);

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
