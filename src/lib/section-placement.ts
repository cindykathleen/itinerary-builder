export type SectionPlacement = {
  id: string;
  sectionId: string | null;
  sectionDate: string | null;
  position: number | null;
};

export function sectionDropIndex(
  cellIds: readonly string[],
  draggedId: string,
  beforeId: string | null,
) {
  if (beforeId === draggedId) {
    const current = cellIds.indexOf(draggedId);
    return current < 0 ? 0 : current;
  }

  const without = cellIds.filter((id) => id !== draggedId);

  if (!beforeId) {
    return without.length;
  }

  const index = without.indexOf(beforeId);
  return index < 0 ? without.length : index;
}

export function moveSectionActivity<T extends SectionPlacement>(
  activities: T[],
  move: { id: string; sectionId: string; sectionDate: string; position: number },
): T[] {
  const moving = activities.find((activity) => activity.id === move.id);

  if (!moving) {
    return activities;
  }

  const rest = activities.filter((activity) => activity.id !== move.id);
  const groups = new Map<string, T[]>();

  for (const activity of rest) {
    if (!activity.sectionId || !activity.sectionDate) {
      continue;
    }

    const key = `${activity.sectionId}\u001f${activity.sectionDate}`;
    const group = groups.get(key) ?? [];
    group.push(activity);
    groups.set(key, group);
  }

  const targetKey = `${move.sectionId}\u001f${move.sectionDate}`;
  const target = [...(groups.get(targetKey) ?? [])].sort(
    (left, right) => (left.position ?? 0) - (right.position ?? 0),
  );
  const index = Math.max(0, Math.min(move.position, target.length));
  target.splice(index, 0, {
    ...moving,
    sectionId: move.sectionId,
    sectionDate: move.sectionDate,
    position: index,
  });
  groups.set(targetKey, target);

  const placed = [...groups.values()].flatMap((group) =>
    [...group]
      .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
      .map((activity, position) => ({ ...activity, position })),
  );
  const loose = rest.filter((activity) => !activity.sectionId || !activity.sectionDate);

  return [...loose, ...placed];
}
