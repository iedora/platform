import { S3Client } from "bun";

// Minimal S3-compatible object-storage client. Covers
// exactly what uploads need: presigned browser PUTs + server-side stat/delete.
// Built on Bun's native S3Client (works against R2, MinIO, AWS S3). A null
// client means "uploads disabled" (no S3_ENDPOINT configured).

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  publicUrl: string; // CDN base; defaults to endpoint/bucket
  forcePathStyle: boolean;
}

export interface BlobStat {
  exists: boolean;
  contentType: string;
  size: number;
}

export class BlobClient {
  private readonly s3: S3Client;
  private readonly publicBase: string;

  constructor(cfg: S3Config) {
    this.s3 = new S3Client({
      accessKeyId: cfg.accessKey,
      secretAccessKey: cfg.secretKey,
      bucket: cfg.bucket,
      region: cfg.region,
      endpoint: cfg.endpoint,
      virtualHostedStyle: !cfg.forcePathStyle,
    });
    this.publicBase = (cfg.publicUrl || `${cfg.endpoint.replace(/\/$/, "")}/${cfg.bucket}`).replace(/\/$/, "");
  }

  /** The CDN/browser address of a key. */
  publicURL(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  /** Inverts publicURL; "" when the URL isn't ours (defends against deleting foreign objects). */
  keyFromPublicURL(url: string): string {
    const prefix = `${this.publicBase}/`;
    return url.startsWith(prefix) ? url.slice(prefix.length) : "";
  }

  /** A URL a browser can PUT the object to within `expiresInSeconds`. */
  presignPut(key: string, expiresInSeconds: number, contentType: string): string {
    return this.s3.file(key).presign({ method: "PUT", expiresIn: expiresInSeconds, type: contentType });
  }

  async stat(key: string): Promise<BlobStat> {
    const file = this.s3.file(key);
    if (!(await file.exists())) return { exists: false, contentType: "", size: 0 };
    const s = await file.stat();
    return { exists: true, contentType: s.type, size: s.size };
  }

  async delete(key: string): Promise<void> {
    await this.s3.file(key).delete();
  }
}

// makeBlobClient returns null (uploads disabled) when no endpoint is configured;
// otherwise validates the required credentials. Ports blob.New.
export function makeBlobClient(cfg: S3Config): BlobClient | null {
  if (!cfg.endpoint) return null;
  if (!cfg.bucket || !cfg.accessKey || !cfg.secretKey) {
    throw new Error("blob: S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY are required with S3_ENDPOINT");
  }
  return new BlobClient(cfg);
}
