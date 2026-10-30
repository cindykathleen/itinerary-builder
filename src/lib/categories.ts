export function categoriesForStop<Category extends { stopId: string | null }>(
  categories: Category[],
  stopId: string,
) {
  return categories.filter((category) =>
    stopId === "" ? category.stopId === null : category.stopId === stopId,
  );
}
