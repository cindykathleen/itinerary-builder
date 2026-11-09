import { expect, test } from "@playwright/test";
import { createItinerary, deleteUser, signUp } from "./support";

let email = "";

test.beforeEach(async ({ page }) => {
  email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await signUp(page, email);
  await createItinerary(page, "Cover trip");
});

test.afterEach(async ({}, testInfo) => {
  const deleted = await deleteUser(email);

  if (testInfo.status === "passed" && deleted !== 1) {
    throw new Error("The test user was not in the test database.");
  }
});

test("uploads a cover without calling Cloudflare", async ({ page }) => {
  const storageRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();

    if (url.includes("r2.cloudflarestorage.com") || url.includes("r2.dev")) {
      storageRequests.push(url);
    }
  });

  await page.locator('input[type="file"]').setInputFiles({
    name: "cover.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });

  const card = page.getByRole("article").filter({ hasText: "Cover trip" });
  await expect(card.locator("img")).toHaveAttribute(
    "src",
    /^https:\/\/covers\.example\.test\/[0-9a-f-]+\.jpg$/,
  );
  await card.locator('summary[aria-label="Actions for Cover trip"]').click();
  await expect(card.getByRole("button", { name: "Edit cover photo" })).toBeVisible();
  expect(storageRequests).toEqual([]);
});
