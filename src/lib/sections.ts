const MAX_SECTIONS = 12;
const MAX_SECTION_NAME_LENGTH = 40;

export function sectionNames(values: string[]) {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const name = value.trim();

    if (!name) {
      continue;
    }

    if (name.length > MAX_SECTION_NAME_LENGTH) {
      throw new Error("Section name must be 40 characters or fewer.");
    }

    const key = name.toLocaleLowerCase();

    if (seen.has(key)) {
      throw new Error("Section names must be unique.");
    }

    seen.add(key);
    names.push(name);
  }

  if (names.length === 0) {
    throw new Error("A section is required.");
  }

  if (names.length > MAX_SECTIONS) {
    throw new Error("An itinerary can have at most 12 sections.");
  }

  return names;
}
