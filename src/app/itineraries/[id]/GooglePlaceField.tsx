"use client";

import { useEffect, useId, useRef, useState } from "react";
import dialogStyles from "../dialog.module.css";

const SEARCH_DELAY_MS = 800;

type PlaceSuggestion = {
  placeId: string;
  name: string;
  address: string;
};

export default function GooglePlaceField({
  place = null,
}: {
  place?: PlaceSuggestion | null;
}) {
  const inputId = useId();
  const listId = useId();
  const descriptionId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const placeRef = useRef(place);
  const [sessionToken, setSessionToken] = useState(() => crypto.randomUUID());
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [selected, setSelected] = useState<PlaceSuggestion | null>(place);
  const [fromSearch, setFromSearch] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    placeRef.current = place;
  }, [place]);

  const clearSearch = () => {
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(0);
    setLoading(false);
    setError("");
  };

  useEffect(() => {
    const dialog = rootRef.current?.closest("dialog");

    if (!dialog) {
      return;
    }

    const resetOnClose = () => {
      clearSearch();
      setSelected(placeRef.current);
      setFromSearch(false);
      setSessionToken(crypto.randomUUID());
    };

    dialog.addEventListener("close", resetOnClose);
    return () => dialog.removeEventListener("close", resetOnClose);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const dismissOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) {
        return;
      }

      clearSearch();
    };

    document.addEventListener("pointerdown", dismissOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", dismissOnOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (selected || query.trim().length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggestions([]);
      setOpen(true);
      setLoading(true);

      try {
        const params = new URLSearchParams({
          input: query.trim(),
          sessionToken,
        });
        const response = await fetch(`/api/places/autocomplete?${params}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as {
          suggestions?: PlaceSuggestion[];
          error?: string;
        };

        if (!response.ok) {
          setSuggestions([]);
          setOpen(false);
          setError(body.error || "Place search failed.");
          return;
        }

        const nextSuggestions = body.suggestions ?? [];
        setError("");
        setSuggestions(nextSuggestions);
        setActiveIndex(0);
        setOpen(true);
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }

        setSuggestions([]);
        setOpen(false);
        setError("Place search failed.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, SEARCH_DELAY_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
      setLoading(false);
    };
  }, [query, selected, sessionToken]);

  const choose = (suggestion: PlaceSuggestion) => {
    setSelected(suggestion);
    setFromSearch(true);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    setError("");
  };

  const clearSelection = () => {
    setSelected(null);
    setFromSearch(false);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    setError("");
    setSessionToken(crypto.randomUUID());
  };

  const moveActive = (direction: 1 | -1) => {
    if (suggestions.length === 0) {
      return;
    }

    setActiveIndex((current) => {
      const next = current + direction;
      if (next < 0) {
        return suggestions.length - 1;
      }
      if (next >= suggestions.length) {
        return 0;
      }
      return next;
    });
  };

  return (
    <div ref={rootRef} className={dialogStyles.field}>
      <label htmlFor={inputId}>Google Maps</label>
      <p id={descriptionId} className={dialogStyles.note}>
        Link the activity to Google Maps.
      </p>
      {selected ? (
        <div className={dialogStyles.googlePlace}>
          <input type="hidden" name="googlePlaceId" value={selected.placeId} />
          {fromSearch ? (
            <input type="hidden" name="sessionToken" value={sessionToken} />
          ) : null}
          <span className={dialogStyles.googlePlaceText}>
            <span className={dialogStyles.googlePlaceName}>{selected.name}</span>
            {selected.address ? (
              <span className={dialogStyles.googlePlaceAddress}>{selected.address}</span>
            ) : null}
          </span>
          <button
            className={dialogStyles.googlePlaceClear}
            type="button"
            aria-label={`Remove ${selected.name}`}
            onClick={clearSelection}
          >
            ×
          </button>
        </div>
      ) : (
        <div className={dialogStyles.googlePlaceSearch}>
          <input
            id={inputId}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-describedby={descriptionId}
            aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
            value={query}
            placeholder="Search for a place"
            autoComplete="off"
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              setError("");
              setOpen(false);

              if (nextQuery.trim().length < 2) {
                setSuggestions([]);
                setLoading(false);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(suggestions.length > 0);
                moveActive(1);
              }

              if (event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(suggestions.length > 0);
                moveActive(-1);
              }

              if (event.key === "Enter") {
                event.preventDefault();
                if (open && suggestions[activeIndex]) {
                  choose(suggestions[activeIndex]);
                }
              }

              if (event.key === "Escape" && open) {
                event.preventDefault();
                event.stopPropagation();
                clearSearch();
              }
            }}
          />
          {open ? (
            <ul id={listId} className={dialogStyles.googlePlaceList} role="listbox">
              {suggestions.length > 0 ? (
                suggestions.map((suggestion, index) => (
                  <li key={suggestion.placeId}>
                    <button
                      id={`${listId}-${index}`}
                      className={dialogStyles.googlePlaceOption}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(suggestion)}
                    >
                      <span className={dialogStyles.googlePlaceName}>{suggestion.name}</span>
                      {suggestion.address ? (
                        <span className={dialogStyles.googlePlaceAddress}>{suggestion.address}</span>
                      ) : null}
                    </button>
                  </li>
                ))
              ) : (
                <li className={dialogStyles.googlePlaceStatus}>
                  {loading ? "Searching…" : "No places found"}
                </li>
              )}
            </ul>
          ) : null}
        </div>
      )}
      {error ? (
        <p className={dialogStyles.hint} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
