import { afterEach, describe, expect, it } from "vitest";
import { coverContentType, coverObjectKey } from "./cover-url";

const publicUrl = "https://pub-9976a5ae3dc54ecb9a4c8fbe27cdc87e.r2.dev";

describe("coverObjectKey", () => {
  const previous = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL = previous;
  });

  it("reads a key stored on this bucket", () => {
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL = publicUrl;

    expect(coverObjectKey(`${publicUrl}/3f9a1c2e-4b5d-4e6f-8a7b-9c0d1e2f3a4b.jpg`)).toBe(
      "3f9a1c2e-4b5d-4e6f-8a7b-9c0d1e2f3a4b.jpg",
    );
  });

  it("rejects a cover that is not on this bucket", () => {
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL = `${publicUrl}/`;

    expect(coverObjectKey("https://example.com/cover.jpg")).toBeNull();
    expect(coverObjectKey(`${publicUrl}/nested/cover.jpg`)).toBeNull();
    expect(coverObjectKey(`${publicUrl}/cover.jpg?download=1`)).toBeNull();
  });
});

describe("coverContentType", () => {
  it("accepts JPEG, PNG, and WebP bytes", () => {
    expect(coverContentType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg")).toBe("image/jpeg");
    expect(
      coverContentType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"),
    ).toBe("image/png");
    const webp = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(coverContentType(webp, "image/webp")).toBe("image/webp");
  });

  it("rejects a declared type that does not match the file", () => {
    expect(coverContentType(Uint8Array.from([0xff, 0xd8, 0xff]), "image/png")).toBeNull();
    expect(coverContentType(Uint8Array.from([0x3c, 0x68, 0x74, 0x6d, 0x6c]), "image/jpeg")).toBeNull();
  });
});
