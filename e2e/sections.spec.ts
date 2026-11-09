import { expect, test } from "@playwright/test";
import { googlePlaceFixtures } from "../src/lib/google-places-fixtures";
import { installMapStub } from "./map-stub";
import { createSectionsItinerary, deleteUser, signUp } from "./support";

const park = googlePlaceFixtures[0];
const hotel = googlePlaceFixtures[1];

let email = "";

test.beforeEach(async ({ page }) => {
  email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await installMapStub(page);
  await signUp(page, email);
  await createSectionsItinerary(page, "Taipei days");
});

test.afterEach(async ({}, testInfo) => {
  const deleted = await deleteUser(email);

  if (testInfo.status === "passed" && deleted !== 1) {
    throw new Error("The test user was not in the test database.");
  }
});

test("places an activity in Morning without a time and filters the map to one stop", async ({
  page,
}) => {
  const board = page.getByRole("region", { name: "Sections" });
  await board.locator('[data-section="Morning"][data-date="2026-11-02"]').click();

  let dialog = page.getByRole("dialog", { name: "New activity" });
  await expect(dialog.locator('input[type="time"]')).toHaveCount(0);
  await expect(dialog.getByText("Morning")).toBeVisible();
  await dialog.getByLabel("Name").fill("Temple visit");
  await dialog.getByPlaceholder("Search for a place").fill("park");
  await dialog.getByRole("option", { name: park.name }).click();
  await dialog.getByLabel("Place").click();
  await dialog.getByRole("option", { name: "Taipei" }).click();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();

  const temple = board.locator("article").filter({ hasText: "Temple visit" });
  await expect(temple).toBeVisible();
  await expect(temple).not.toHaveText(/\d{1,2}:\d{2}/);

  const activities = page.getByRole("region", { name: "Activities" });
  await activities.locator("summary[aria-label='Add']").click();
  await activities.getByRole("button", { name: "New activity" }).click();
  dialog = page.getByRole("dialog", { name: "New activity" });
  await dialog.getByLabel("Name").fill("Hotel night");
  await dialog.getByPlaceholder("Search for a place").fill("hotel");
  await dialog.getByRole("option", { name: hotel.name }).click();
  await dialog.getByLabel("Place").click();
  await dialog.getByRole("option", { name: "Kyoto" }).click();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Map" }).click();
  const map = page.getByRole("region", { name: "Map" });
  await expect(map.getByTitle(`${park.name}, on the timeline`)).toBeVisible();
  await expect(map.getByTitle(`${hotel.name}, not on the timeline`)).toBeVisible();

  await page.getByRole("group", { name: "Stops" }).getByRole("button", { name: "Taipei" }).click();
  await expect(page).toHaveURL(/view=map&stop=/);
  await expect(map.getByTitle(`${park.name}, on the timeline`)).toBeVisible();
  await expect(map.getByTitle(`${hotel.name}, not on the timeline`)).toHaveCount(0);
});
