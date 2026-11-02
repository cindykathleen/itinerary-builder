import { expect, test } from "@playwright/test";
import { deleteUser, signUp } from "./support";

let email = "";

test.beforeEach(() => {
  email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
});

test.afterEach(async ({}, testInfo) => {
  const deleted = await deleteUser(email);

  if (testInfo.status === "passed" && deleted !== 1) {
    throw new Error("The test user was not in the test database.");
  }
});

test("signs up, lands on My Itineraries, and returns to sign-in after signing out", async ({
  page,
}) => {
  await signUp(page, email);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();

  await page.goto("/itineraries");
  await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
});
