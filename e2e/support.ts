import { expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { loadLocalEnv, testDatabaseUrl } from "./env";

export const password = "e2e-password";

export async function signUp(page: Page, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password *", { exact: true }).fill(password);
  await page.getByLabel("Confirm your password").fill(password);
  await page.getByRole("button", { name: "Sign Up" }).click();
  await expect(page.getByRole("heading", { name: "My Itineraries" })).toBeVisible();
}

export async function createItinerary(page: Page, name: string) {
  await page.getByRole("button", { name: "+ New" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New itinerary" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Start date").fill("2026-11-02");
  await dialog.getByLabel("End date").fill("2026-11-03");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

export async function createSectionsItinerary(page: Page, name: string) {
  await createItinerary(page, name);
  await page.getByRole("link", { name, exact: true }).click();

  const schedule = page.getByRole("dialog", { name: "Settings" });
  await expect(schedule).toBeVisible();
  await schedule.getByLabel("Places").fill("Taipei,Kyoto,");
  await schedule.getByRole("radio", { name: "Sections" }).check();
  await schedule.getByRole("textbox", { name: "Section 1", exact: true }).fill("Morning");
  await schedule.getByRole("button", { name: "Save" }).click();
  await expect(schedule).toBeHidden();
  await expect(page.getByRole("region", { name: "Sections" })).toBeVisible();
}

export async function createScheduledItinerary(page: Page, name: string) {
  await page.getByRole("button", { name: "+ New" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New itinerary" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Start date").fill("2026-11-02");
  await dialog.getByLabel("End date").fill("2026-11-03");
  await dialog.getByRole("button", { name: "Create" }).click();
  await page.getByRole("link", { name, exact: true }).click();

  const schedule = page.getByRole("dialog", { name: "Settings" });
  await expect(schedule).toBeVisible();
  await schedule.getByLabel("Places").fill("Kyoto,");
  await schedule.getByLabel("Day start").fill("08:00");
  await schedule.getByLabel("Day end").fill("20:00");
  await schedule.getByRole("radio", { name: "30m" }).check();
  await schedule.getByRole("button", { name: "Save" }).click();
  await expect(schedule).toBeHidden();
  await expect(page.getByRole("region", { name: "Timeline" })).toBeVisible();
}

export async function deleteUser(email: string) {
  if (!email) {
    return 0;
  }

  const databaseUrl = loadLocalEnv().DATABASE_URL;

  if (!databaseUrl) {
    return 0;
  }

  const database = new Client({ connectionString: testDatabaseUrl(databaseUrl) });
  await database.connect();

  try {
    await database.query(
      `DELETE FROM itineraries
       WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [email],
    );
    const deleted = await database.query(`DELETE FROM users WHERE email = $1`, [email]);
    return deleted.rowCount ?? 0;
  } finally {
    await database.end();
  }
}
