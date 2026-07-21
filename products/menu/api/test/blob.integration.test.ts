import { beforeAll, describe, expect, test } from "vitest";
import { AwsClient } from "aws4fetch";

import { makeBlobClient, type BlobClient, type S3Config } from "../src/blob.ts";

// Integration test for the aws4fetch BlobClient against a real S3-compatible
// server (MinIO in CI, or any endpoint via S3_TEST_ENDPOINT locally). Skips when
// unset — same gate style as the framework/db suites (HAS_DB). Verifies the one
// thing unit tests can't: that the SigV4 presigning + stat/delete actually round
// -trip on the wire, so a signing regression fails here instead of at deploy.

const ENDPOINT = process.env.S3_TEST_ENDPOINT;
const HAS_S3 = Boolean(ENDPOINT);

const cfg: S3Config = {
  endpoint: ENDPOINT ?? "",
  region: process.env.S3_TEST_REGION ?? "us-east-1",
  bucket: process.env.S3_TEST_BUCKET ?? "uploads-test",
  accessKey: process.env.S3_TEST_ACCESS_KEY ?? "minio",
  secretKey: process.env.S3_TEST_SECRET_KEY ?? "minio12345",
  publicUrl: "",
  forcePathStyle: true, // MinIO / path-style S3
};

describe("BlobClient (S3-compatible integration)", () => {
  let blob: BlobClient;

  beforeAll(async () => {
    if (!HAS_S3) return;
    // Ensure the bucket exists (idempotent PUT — 200 create, 409 already-there).
    const aws = new AwsClient({
      accessKeyId: cfg.accessKey,
      secretAccessKey: cfg.secretKey,
      region: cfg.region,
      service: "s3",
    });
    await aws
      .fetch(`${cfg.endpoint.replace(/\/$/, "")}/${cfg.bucket}`, { method: "PUT" })
      .catch(() => {});
    blob = makeBlobClient(cfg)!;
  });

  test.skipIf(!HAS_S3)("presign PUT → upload → stat → delete round-trips", async () => {
    const key = `test/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
    const body = "hello from aws4fetch";

    const url = await blob.presignPut(key, 300, "text/plain");
    const put = await fetch(url, {
      method: "PUT",
      headers: { "content-type": "text/plain" },
      body,
    });
    expect(put.ok).toBe(true);

    const stat = await blob.stat(key);
    expect(stat.exists).toBe(true);
    expect(stat.contentType).toBe("text/plain");
    expect(stat.size).toBe(body.length);

    await blob.delete(key);
    expect((await blob.stat(key)).exists).toBe(false);
  });

  test.skipIf(!HAS_S3)("stat of a missing key reports not-exists", async () => {
    expect((await blob.stat(`test/missing-${Date.now()}`)).exists).toBe(false);
  });
});
