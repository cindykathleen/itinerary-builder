"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type ActivityHighlightValue = {
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
};

const ActivityHighlightContext = createContext<ActivityHighlightValue | null>(null);

export function ActivityHighlightProvider({ children }: { children: ReactNode }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const value = useMemo(() => ({ hoveredId, setHoveredId }), [hoveredId]);

  return (
    <ActivityHighlightContext.Provider value={value}>
      {children}
    </ActivityHighlightContext.Provider>
  );
}

export function useActivityHighlight() {
  return useContext(ActivityHighlightContext);
}
