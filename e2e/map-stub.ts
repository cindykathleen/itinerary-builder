import type { Page } from "@playwright/test";

export async function installMapStub(page: Page) {
  await page.addInitScript(() => {
    class Bounds {
      extend() {}
    }

    class MapInstance {
      element: HTMLElement;
      zoom = 2;
      count = 0;

      constructor(element: HTMLElement) {
        this.element = element;
        element.dataset.mapStub = "true";
      }

      setZoom(zoom: number) {
        this.zoom = zoom;
        this.element.dataset.zoom = String(zoom);
      }

      getZoom() {
        return this.zoom;
      }

      panTo(position: { lat: number; lng: number }) {
        this.element.dataset.panLat = String(position.lat);
        this.element.dataset.panLng = String(position.lng);
      }

      setCenter(position: { lat: number; lng: number }) {
        this.panTo(position);
      }

      fitBounds() {}
    }

    class InfoWindowInstance {
      private header: Node | null = null;
      private body: Node | null = null;
      private popup: HTMLElement | null = null;

      setHeaderContent(content: Node) {
        this.header = content;
      }

      setContent(content: Node) {
        this.body = content;
      }

      open(options: { map: MapInstance }) {
        this.close();
        const popup = document.createElement("div");
        popup.dataset.mapPopup = "true";
        popup.style.position = "absolute";
        popup.style.zIndex = "5";
        popup.style.inset = "16px 16px auto 16px";
        popup.style.background = "#ffffff";

        if (this.header) {
          popup.append(this.header);
        }

        if (this.body) {
          popup.append(this.body);
        }

        options.map.element.append(popup);
        this.popup = popup;
      }

      close() {
        this.popup?.remove();
        this.popup = null;
      }
    }

    class PinElement {
      element: HTMLElement;
      background: string;
      borderColor: string;
      glyphColor: string;

      constructor(options: { background: string; borderColor: string; glyphColor: string }) {
        this.element = document.createElement("div");
        this.background = options.background;
        this.borderColor = options.borderColor;
        this.glyphColor = options.glyphColor;
        this.element.style.width = "28px";
        this.element.style.height = "28px";
      }
    }

    class AdvancedMarkerElement {
      map: MapInstance | null;
      position: { lat: number; lng: number };
      content: HTMLElement;
      private titleValue: string;

      constructor(options: {
        map: MapInstance;
        position: { lat: number; lng: number };
        title: string;
        content: HTMLElement;
      }) {
        this.map = options.map;
        this.position = options.position;
        this.content = options.content;
        this.titleValue = options.title;
        this.content.title = options.title;
        this.content.style.position = "absolute";
        this.content.style.left = `${24 + options.map.count * 40}px`;
        this.content.style.top = "24px";
        options.map.count += 1;
        options.map.element.append(this.content);
      }

      get title() {
        return this.titleValue;
      }

      set title(value: string) {
        this.titleValue = value;
        this.content.title = value;
      }

      addListener(event: string, handler: () => void) {
        if (event === "click") {
          this.content.addEventListener("click", () => handler());
        }
      }
    }

    window.google = {
      maps: {
        importLibrary(library: string) {
          if (library === "maps") {
            return Promise.resolve({ Map: MapInstance, InfoWindow: InfoWindowInstance });
          }

          if (library === "marker") {
            return Promise.resolve({ AdvancedMarkerElement, PinElement });
          }

          return Promise.resolve({});
        },
        LatLngBounds: Bounds,
      },
    } as unknown as NonNullable<Window["google"]>;
  });

  const blockGoogle = (route: { abort: () => Promise<void> }) => route.abort();
  await page.route("https://maps.googleapis.com/**", blockGoogle);
  await page.route("https://places.googleapis.com/**", blockGoogle);
  await page.route("https://maps.gstatic.com/**", blockGoogle);
}
