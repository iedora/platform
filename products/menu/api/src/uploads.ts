import type { Database } from "@iedora/service-runtime";

import type { BlobClient } from "./blob.ts";
import { itemInRestaurant, setItemImage, setRestaurantAsset } from "./data/assets.ts";
import type { Restaurant } from "./domain.ts";
import { invalid } from "./errors.ts";
import type { MenuDB } from "./schema.ts";

// Presigned browser PUTs to S3-compatible storage.
// Flow: presign → client PUT → commit (verify the object landed,
// persist the URL, delete the replaced object). Every key lives under
// r/{restaurantID}/ — checked when building AND when committing.

const imageExt: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type Persist = (db: Database<MenuDB>, restaurantId: string, itemId: string, url: string) => Promise<string>;

interface UploadTarget {
  name: string;
  maxBytes: number;
  keyDir: string; // prefix under r/{restaurantID}/
  perItem?: boolean; // key nests under keyDir/{itemID}; ownership verified at presign
  persist?: Persist; // writes (url) / clears (""); nil for ephemeral targets
}

const restaurantAsset = (target: string): Persist => (db, restaurantId, _itemId, url) =>
  setRestaurantAsset(db.db, restaurantId, target, url);

const MiB = 1 << 20;

export const UploadTargets: Record<string, UploadTarget> = {
  "restaurant-logo": { name: "restaurant-logo", maxBytes: 2 * MiB, keyDir: "logo", persist: restaurantAsset("restaurant-logo") },
  "restaurant-banner": { name: "restaurant-banner", maxBytes: 5 * MiB, keyDir: "banner", persist: restaurantAsset("restaurant-banner") },
  "item-photo": {
    name: "item-photo",
    maxBytes: 3 * MiB,
    keyDir: "items",
    perItem: true,
    persist: (db, restaurantId, itemId, url) => setItemImage(db.db, itemId, restaurantId, url),
  },
  "menu-import-photo": { name: "menu-import-photo", maxBytes: 10 * MiB, keyDir: "imports" }, // ephemeral AI input
};

const PRESIGN_TTL_SECONDS = 5 * 60;

export interface PresignedUpload {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresInSeconds: number;
  maxBytes: number;
}

export class Uploads {
  constructor(
    private readonly db: Database<MenuDB>,
    private readonly blob: BlobClient,
  ) {}

  // presign authorizes one upload. For item photos, itemId must belong to the
  // restaurant (verified against the DB, not trusted from the client).
  async presign(
    r: Restaurant,
    targetName: string,
    contentType: string,
    itemId: string,
  ): Promise<PresignedUpload> {
    const target = UploadTargets[targetName];
    if (!target) throw invalid("unknown upload target");
    const ext = imageExt[contentType];
    if (!ext) throw invalid("content type must be image/jpeg, image/png or image/webp");
    let dir = target.keyDir;
    if (target.perItem) {
      await itemInRestaurant(this.db.db, itemId, r.id);
      dir = `${dir}/${itemId}`;
    }
    const key = `r/${r.id}/${dir}/${randomSlug()}.${ext}`;
    return {
      uploadUrl: await this.blob.presignPut(key, PRESIGN_TTL_SECONDS, contentType),
      publicUrl: this.blob.publicURL(key),
      key,
      expiresInSeconds: PRESIGN_TTL_SECONDS,
      maxBytes: target.maxBytes,
    };
  }

  // commit finalizes an upload: re-verify the key prefix, confirm the object
  // exists + is a permitted image within budget, persist its URL, clean up the
  // replaced one.
  async commit(r: Restaurant, targetName: string, key: string, itemId: string): Promise<string> {
    const target = UploadTargets[targetName];
    if (!target) throw invalid("unknown upload target");
    if (!key.startsWith(`r/${r.id}/${target.keyDir}/`)) {
      throw invalid("key does not belong to this restaurant");
    }
    // A presigned PUT binds neither content type nor size — enforce both against
    // what the browser actually stored before publishing its URL.
    const obj = await this.blob.stat(key);
    if (!obj.exists) throw invalid("upload not found — PUT the file before committing");
    if (!imageExt[obj.contentType]) {
      await this.blob.delete(key);
      throw invalid("uploaded file is not a permitted image type");
    }
    if (obj.size > target.maxBytes) {
      await this.blob.delete(key);
      throw invalid("uploaded file exceeds the size limit");
    }
    const url = this.blob.publicURL(key);
    if (target.persist) {
      const previous = await target.persist(this.db, r.id, itemId, url);
      await this.deleteByURL(previous);
    }
    return url;
  }

  // clear removes an asset: NULL the column, then best-effort delete the object.
  async clear(r: Restaurant, targetName: string, itemId: string): Promise<void> {
    const target = UploadTargets[targetName];
    if (!target?.persist) throw invalid("unknown upload target");
    const previous = await target.persist(this.db, r.id, itemId, "");
    await this.deleteByURL(previous);
  }

  // deleteByURL drops the object behind a stored URL, ignoring foreign URLs and
  // delete failures (orphans are cheap; correctness is not).
  private async deleteByURL(url: string): Promise<void> {
    const key = this.blob.keyFromPublicURL(url);
    if (key) await this.blob.delete(key).catch(() => {});
  }
}

// randomSlug defeats CDN/browser caching of replaced assets.
function randomSlug(): string {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
