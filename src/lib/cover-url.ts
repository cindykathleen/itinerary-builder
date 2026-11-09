export const COVER_MAX_BYTES = 5 * 1024 * 1024;

const COVER_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type CoverContentType = keyof typeof COVER_TYPES;

export function coverExtension(contentType: CoverContentType) {
  return COVER_TYPES[contentType];
}

export function publicCoverBase() {
  const value = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.trim();

  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/$/, "") || "/";
    return url;
  } catch {
    return null;
  }
}

export function coverObjectKey(photoUrl: string) {
  const base = publicCoverBase();

  if (!base) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(photoUrl);
  } catch {
    return null;
  }

  if (url.origin !== base.origin || url.search || url.hash) {
    return null;
  }

  const basePath = base.pathname === "/" ? "" : base.pathname.replace(/\/$/, "");

  if (!url.pathname.startsWith(`${basePath}/`)) {
    return null;
  }

  let key: string;

  try {
    key = decodeURIComponent(url.pathname.slice(basePath.length + 1));
  } catch {
    return null;
  }

  if (!/^[A-Za-z0-9._-]+$/.test(key)) {
    return null;
  }

  return key;
}

export function coverContentType(bytes: Uint8Array, declared: string): CoverContentType | null {
  const sniffed = sniffedCoverType(bytes);

  if (!sniffed) {
    return null;
  }

  const declaredType = declared.split(";")[0]?.trim().toLowerCase();

  if (declaredType && declaredType !== sniffed && declaredType !== "application/octet-stream") {
    return null;
  }

  return sniffed;
}

function sniffedCoverType(bytes: Uint8Array): CoverContentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}
