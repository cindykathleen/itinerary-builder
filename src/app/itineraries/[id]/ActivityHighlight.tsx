"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type HoverSource = "sidebar" | "timeline" | "map";

type ActivityHighlightValue = {
  hoveredId: string | null;
  hoveredPlaceId: string | null;
  source: HoverSource | null;
  setHoveredId: (id: string | null, source?: Exclude<HoverSource, "map">) => void;
  setHoveredPlaceId: (placeId: string | null) => void;
};

const ActivityHighlightContext = createContext<ActivityHighlightValue | null>(null);

export function ActivityHighlightProvider({ children }: { children: ReactNode }) {
  const [hover, setHover] = useState<{
    activityId: string | null;
    placeId: string | null;
    source: HoverSource | null;
  }>({ activityId: null, placeId: null, source: null });
  const setHoveredId = useCallback((id: string | null, source: Exclude<HoverSource, "map"> = "sidebar") => {
    setHover({
      activityId: id,
      placeId: null,
      source: id ? source : null,
    });
  }, []);
  const setHoveredPlaceId = useCallback((placeId: string | null) => {
    setHover({
      activityId: null,
      placeId,
      source: placeId ? "map" : null,
    });
  }, []);
  const value = useMemo(
    () => ({
      hoveredId: hover.activityId,
      hoveredPlaceId: hover.placeId,
      source: hover.source,
      setHoveredId,
      setHoveredPlaceId,
    }),
    [hover, setHoveredId, setHoveredPlaceId],
  );

  return (
    <ActivityHighlightContext.Provider value={value}>
      {children}
    </ActivityHighlightContext.Provider>
  );
}

export function useActivityHighlight() {
  return useContext(ActivityHighlightContext);
}
