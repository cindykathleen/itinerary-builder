import { afterEach, describe, expect, it } from "vitest";
import { deleteCoverObject, uploadCoverObject } from "./r2";

const previous = {
  fixtures: process.env.R2_FIXTURES,
  publicUrl: process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
  bucket: process.env.R2_BUCKET_NAME,
  account: process.env.R2_ACCOUNT_ID,
  accessKey: process.env.R2_ACCESS_KEY_ID,
  secret: process.env.R2_ACCESS_KEY_SECRET,
};

afterEach(() => {
  process.env.R2_FIXTURES = previous.fixtures;
  process.env.NEXT_PUBLIC_R2_PUBLIC_URL = previous.publicUrl;
  process.env.R2_BUCKET_NAME = previous.bucket;
  process.env.R2_ACCOUNT_ID = previous.account;
  process.env.R2_ACCESS_KEY_ID = previous.accessKey;
  process.env.R2_ACCESS_KEY_SECRET = previous.secret;
});

describe("cover fixtures", () => {
  it("stores a public URL without R2 credentials", async () => {
    process.env.R2_FIXTURES = "1";
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL = "https://covers.example.test";
    delete process.env.R2_BUCKET_NAME;
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_ACCESS_KEY_SECRET;

    const photoUrl = await uploadCoverObject(Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg", "jpg");

    expect(photoUrl).toMatch(/^https:\/\/covers\.example\.test\/[0-9a-f-]+\.jpg$/);
    await deleteCoverObject(photoUrl);
  });
});
