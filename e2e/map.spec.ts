import { expect, test } from "@playwright/test";
import { googlePlaceFixtures } from "../src/lib/google-places-fixtures";
import { installMapStub } from "./map-stub";
import { createScheduledItinerary, deleteUser, signUp } from "./support";

const park = googlePlaceFixtures[0];
const hotel = googlePlaceFixtures[1];

let email = "";
let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  googleRequests = [];
  page.on("request", (request) => {
    const url = request.url();

    if (url.includes("googleapis.com") || url.includes("maps.gstatic.com")) {
      googleRequests.push(url);
    }
  });
  await installMapStub(page);
  await signUp(page, email);
  await createScheduledItinerary(page, "Kyoto weekend");
});

test.afterEach(async ({}, testInfo) => {
  const deleted = await deleteUser(email);

  if (testInfo.status === "passed" && deleted !== 1) {
    throw new Error("The test user was not in the test database.");
  }
});

test("links fixture places on the map without calling Google", async ({ page }) => {
  const timeline = page.getByRole("region", { name: "Timeline" });
  await timeline.locator('[data-date="2026-11-02"][data-minutes="480"]').click();

  let dialog = page.getByRole("dialog", { name: "New activity" });
  await dialog.getByLabel("Name").fill("Morning walk");
  await dialog.getByPlaceholder("Search for a place").fill("park");
  await dialog.getByRole("option", { name: park.name }).click();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();

  const activities = page.getByRole("region", { name: "Activities" });
  await activities.locator("summary[aria-label='Add']").click();
  await activities.getByRole("button", { name: "New activity" }).click();
  dialog = page.getByRole("dialog", { name: "New activity" });
  await dialog.getByLabel("Name").fill("Garden stroll");
  await dialog.getByPlaceholder("Search for a place").fill("hotel");
  await dialog.getByRole("option", { name: hotel.name }).click();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();
  await expect(activities.getByRole("heading", { name: "Garden stroll" })).toBeVisible();

  await page.getByRole("button", { name: "Map" }).click();
  const map = page.getByRole("region", { name: "Map" });
  await expect(map.locator("[data-map-stub]")).toBeAttached();
  await expect(map.getByTitle(`${park.name}, on the timeline`)).toBeVisible();
  await expect(map.getByTitle(`${hotel.name}, not on the timeline`)).toBeVisible();

  await map.getByTitle(`${park.name}, on the timeline`).click();
  const parkLink = map.getByRole("link", { name: "Google Map" });
  await expect(map.getByRole("heading", { name: park.name })).toBeVisible();
  await expect(map.getByText("Morning walk")).toHaveCount(0);
  await expect(parkLink).toBeVisible();
  await expect(parkLink).toHaveAttribute("href", /query_place_id=fixture-park/);

  await map.getByTitle(`${hotel.name}, not on the timeline`).click();
  const hotelLink = map.getByRole("link", { name: "Google Map" });
  await expect(hotelLink).toBeVisible();
  await expect(hotelLink).toHaveAttribute("href", /query_place_id=fixture-hotel/);
  await map.getByRole("button", { name: "Add Garden stroll to itinerary" }).click();
  await expect(timeline.locator('[aria-label="Garden stroll"]')).toBeVisible();
  await expect(map.getByTitle(`${hotel.name}, on the timeline`)).toBeVisible();

  await timeline.locator('[aria-label="Morning walk"]').hover();
  await expect(map.locator("[data-map-stub]")).toHaveAttribute("data-pan-lat", String(park.latitude));
  await expect(map.locator("[data-map-stub]")).toHaveAttribute("data-zoom", "14");
  expect(googleRequests).toEqual([]);
});
