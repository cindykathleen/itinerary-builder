import { expect, test } from "@playwright/test";
import { createScheduledItinerary, deleteUser, signUp } from "./support";

let email = "";

test.beforeEach(async ({ page }) => {
  email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await signUp(page, email);
  await createScheduledItinerary(page, "Kyoto weekend");
});

test.afterEach(async ({}, testInfo) => {
  const deleted = await deleteUser(email);

  if (testInfo.status === "passed" && deleted !== 1) {
    throw new Error("The test user was not in the test database.");
  }
});

test("places an activity, edits its note, and keeps the note after reload", async ({ page }) => {
  const timeline = page.getByRole("region", { name: "Timeline" });
  await timeline.locator('[data-date="2026-11-02"][data-minutes="480"]').click();

  const dialog = page.getByRole("dialog", { name: "New activity" });
  await dialog.getByLabel("Name").fill("Morning walk");
  await dialog.getByLabel("Note").fill("Meet at the lobby");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();

  const block = timeline.locator('[aria-label="Morning walk"]');
  await expect(block).toBeVisible();
  await block.hover();
  const note = page.getByRole("textbox", { name: "Note for Morning walk" });
  await expect(note).toHaveValue("Meet at the lobby");
  await note.fill("Bring a jacket");

  const saved = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.ok(),
  );
  await page.getByRole("heading", { level: 1, name: "Kyoto weekend" }).click();
  await saved;

  await page.reload();
  await timeline.locator('[aria-label="Morning walk"]').hover();
  await expect(page.getByRole("textbox", { name: "Note for Morning walk" })).toHaveValue(
    "Bring a jacket",
  );
});

test("indents an activity that overlaps another", async ({ page }) => {
  const timeline = page.getByRole("region", { name: "Timeline" });
  const cell = timeline.locator('[data-date="2026-11-02"][data-minutes="480"]');

  await cell.click();
  let dialog = page.getByRole("dialog", { name: "New activity" });
  await dialog.getByLabel("Name").fill("Morning walk");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();

  await cell.click({ position: { x: 1, y: 1 } });
  dialog = page.getByRole("dialog", { name: "New activity" });
  await dialog.getByLabel("Name").fill("Museum");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();

  const walk = await timeline.locator('[aria-label="Morning walk"]').boundingBox();
  const museum = await timeline.locator('[aria-label="Museum"]').boundingBox();

  expect(walk).not.toBeNull();
  expect(museum).not.toBeNull();

  const boxes = [walk!, museum!].sort((left, right) => left.x - right.x);
  expect(boxes[1].x).toBeGreaterThan(boxes[0].x + 4);
  expect(boxes[1].width).toBeLessThan(boxes[0].width - 4);
});
