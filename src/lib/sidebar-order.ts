export const SIDEBAR_DRAG_OPEN = "application/x-sidebar-open";
export const SIDEBAR_DRAG_SCHEDULED = "application/x-sidebar-scheduled";

export type SidebarOrderItem = {
  id: string;
  scheduled: boolean;
};

export type SidebarDropPlacement = "before" | "after";

export function reorderSidebarActivities<T extends SidebarOrderItem>(
  activities: T[],
  draggedId: string,
  targetId: string,
  placement: "before" | "after",
): T[] | null {
  if (draggedId === targetId) {
    return null;
  }

  const dragged = activities.find((activity) => activity.id === draggedId);
  const target = activities.find((activity) => activity.id === targetId);

  if (!dragged || !target || dragged.scheduled !== target.scheduled) {
    return null;
  }

  const next = activities.filter((activity) => activity.id !== draggedId);
  let index = next.findIndex((activity) => activity.id === targetId);

  if (placement === "after") {
    index += 1;
  }

  next.splice(index, 0, dragged);

  if (next.every((activity, position) => activity.id === activities[position]?.id)) {
    return null;
  }

  return next;
}

export function sidebarBeforeId<T extends SidebarOrderItem>(
  activities: T[],
  draggedId: string,
) {
  const index = activities.findIndex((activity) => activity.id === draggedId);

  if (index < 0) {
    return null;
  }

  const dragged = activities[index];
  const next = activities[index + 1];

  if (!next || next.scheduled !== dragged.scheduled) {
    return null;
  }

  return next.id;
}
