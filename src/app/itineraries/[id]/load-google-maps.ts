declare global {
  interface Window {
    gm_authFailure?: () => void;
    google?: {
      maps: {
        importLibrary: (library: string) => Promise<Record<string, unknown>>;
        __ib__?: () => void;
      };
    };
  }
}

let mapsReady: Promise<void> | null = null;

function bootstrap(options: Record<string, string>) {
  const googleNamespace = (window.google ??= {
    maps: {} as NonNullable<Window["google"]>["maps"],
  });
  const maps = googleNamespace.maps;
  const libraries = new Set<string>();
  const params = new URLSearchParams();
  let scriptReady: Promise<void> | undefined;

  const loadScript = () =>
    scriptReady ??
    (scriptReady = new Promise((resolve, reject) => {
      queueMicrotask(() => {
        const script = document.createElement("script");
        params.set("libraries", [...libraries].join(","));

        for (const [key, value] of Object.entries(options)) {
          params.set(key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), value);
        }

        params.set("callback", "google.maps.__ib__");
        script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
        script.async = true;
        maps.__ib__ = () => resolve();
        script.onerror = () => {
          mapsReady = null;
          scriptReady = undefined;
          reject(new Error("Google Maps could not load."));
        };
        document.head.append(script);
      });
    }));

  if (typeof maps.importLibrary !== "function") {
    maps.importLibrary = (library) => {
      libraries.add(library);
      return loadScript().then(() => maps.importLibrary(library));
    };
  }
}

export function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps?.importLibrary && mapsReady) {
    return mapsReady;
  }

  mapsReady ??= new Promise((resolve, reject) => {
    bootstrap({ key: apiKey, v: "weekly", loading: "async" });
    const maps = window.google?.maps;

    if (!maps) {
      reject(new Error("Google Maps could not load."));
      return;
    }

    Promise.all([maps.importLibrary("maps"), maps.importLibrary("marker")])
      .then(() => resolve())
      .catch(reject);
  });

  return mapsReady;
}
