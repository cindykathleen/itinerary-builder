import { Agent as HttpsAgent } from "node:https";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { coverObjectKey, type CoverContentType } from "./cover-url";

const TRANSIENT_UPLOAD_ERROR =
  /bad record mac|EPROTO|ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|TimeoutError/i;

function coverFixturesEnabled() {
  return process.env.R2_FIXTURES === "1";
}

function r2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_ACCESS_KEY_SECRET;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Cloudflare R2 is not configured.");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    // The SDK otherwise waits for 100-continue on photos over 2 MB. R2 answers
    // that handshake with a TLS bad_record_mac alert and the upload fails.
    expectContinueHeader: false,
    requestHandler: {
      connectionTimeout: 5_000,
      requestTimeout: 30_000,
      httpsAgent: new HttpsAgent({ keepAlive: false, maxSockets: 50 }),
    },
  });
}

export async function uploadCoverObject(body: Buffer, contentType: CoverContentType, extension: string) {
  const bucket = process.env.R2_BUCKET_NAME;
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.trim().replace(/\/$/, "");

  if (!base || (!coverFixturesEnabled() && !bucket)) {
    throw new Error("Cloudflare R2 is not configured.");
  }

  const key = `${crypto.randomUUID()}.${extension}`;

  if (coverFixturesEnabled()) {
    return `${base}/${key}`;
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await r2Client().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentLength: body.length,
          ContentType: contentType,
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      return `${base}/${key}`;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "";
      if (attempt === 3 || !TRANSIENT_UPLOAD_ERROR.test(message)) {
        throw error;
      }
    }
  }

  throw lastError;
}

export async function deleteCoverObject(photoUrl: string | null | undefined) {
  if (!photoUrl) {
    return;
  }

  if (coverFixturesEnabled()) {
    return;
  }

  const key = coverObjectKey(photoUrl);
  const bucket = process.env.R2_BUCKET_NAME;

  if (!key || !bucket) {
    return;
  }

  await r2Client().send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}
