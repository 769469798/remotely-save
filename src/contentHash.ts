import type { Entity, MixedEntity, SUPPORTED_SERVICES_TYPE } from "./baseTypes";
import { arrayBufferToHex, getSha1 } from "./misc";

/**
 * Dropbox content hash block size.
 * https://www.dropbox.com/developers/reference/content-hash
 */
export const DROPBOX_CONTENT_HASH_BLOCK_SIZE = 4 * 1024 * 1024;

/**
 * How a provider's `Entity.hash` is calculated.
 * `sha1` is also the plugin's own hash when the provider does not supply one.
 * `unsupported` (pCloud) is a proprietary value we do not recompute.
 */
export type ContentHashKind =
  | "dropbox-content-hash"
  | "sha1"
  | "sha256"
  | "md5"
  | "unsupported";

export interface ContentHashReaders {
  readLocal: (key: string) => Promise<ArrayBuffer>;
  readRemote: (key: string) => Promise<ArrayBuffer>;
}

export interface ContentHashFillStats {
  cacheHits: number;
  localReads: number;
  remoteReads: number;
}

const MD5_SHIFT = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
  9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
  16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
  21,
];

// RFC 1321 T[i] = floor(2^32 * abs(sin(i + 1))). Hardcoded so float rounding
// cannot drift from the standard table.
const MD5_K = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a,
  0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
  0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
  0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8,
  0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
  0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
  0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
  0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
  0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
];

const u32 = (n: number) => n >>> 0;

const rotl32 = (x: number, c: number) => u32((x << c) | (x >>> (32 - c)));

/**
 * Non-empty content hash, lowercased when it is hex.
 * Surrounding quotes are removed so an S3-style `"etag"` can still compare.
 */
export const normalizeContentHash = (
  hash: string | undefined | null
): string | undefined => {
  if (hash === undefined || hash === null) {
    return undefined;
  }
  let trimmed = hash.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  if (trimmed === "") {
    return undefined;
  }
  if (/^[0-9a-f]+$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return trimmed;
};

export const hasContentHash = (hash: string | undefined | null): boolean => {
  return normalizeContentHash(hash) !== undefined;
};

/**
 * True only when both sides have a present, equal content hash.
 * A missing hash is not a match.
 */
export const contentHashesEqual = (
  a: string | undefined | null,
  b: string | undefined | null
): boolean => {
  const left = normalizeContentHash(a);
  const right = normalizeContentHash(b);
  if (left === undefined || right === undefined) {
    return false;
  }
  return left === right;
};

/**
 * Existing fast path: client mtime lines up with the remote mtime, and the
 * encrypted (or plain) sizes match.
 */
export const mtimeAndSizeEncEqual = (
  local: Entity,
  remote: Entity
): boolean => {
  return (
    (local.mtimeCli === remote.mtimeCli ||
      local.mtimeCli === remote.mtimeSvr) &&
    local.sizeEnc === remote.sizeEnc
  );
};

/**
 * Reading bytes is only worth it when the stored sizes already agree.
 * A size mismatch means the contents differ, so hashing cannot help.
 */
export const sizesMatchForContentHashRead = (
  local: Entity,
  remote: Entity
): boolean => {
  if (typeof local.sizeEnc === "number" && typeof remote.sizeEnc === "number") {
    return local.sizeEnc === remote.sizeEnc;
  }
  if (typeof local.size === "number" && typeof remote.size === "number") {
    return local.size === remote.size;
  }
  return false;
};

/**
 * End-to-end encryption clears provider hashes because they describe
 * ciphertext. Do not synthesize a replacement: a plaintext hash and a
 * ciphertext hash are not comparable, and storing one would poison later
 * syncs if encryption is turned off.
 */
export const encryptionBlocksContentHash = (
  password: string | undefined
): boolean => {
  return (password ?? "") !== "";
};

export const contentHashKindForService = (
  service: SUPPORTED_SERVICES_TYPE
): ContentHashKind => {
  switch (service) {
    case "dropbox":
      return "dropbox-content-hash";
    case "box":
      return "sha1";
    case "yandexdisk":
      return "sha256";
    case "googledrive":
    case "koofr":
    case "azureblobstorage":
      return "md5";
    case "pcloud":
      return "unsupported";
    // No comparable provider hash. SHA-1 of both sides is our own check.
    case "s3":
    case "webdav":
    case "onedrive":
    case "onedrivefull":
    case "webdis":
      return "sha1";
    default:
      return "unsupported";
  }
};

const md5Hex = (content: ArrayBuffer): string => {
  const bytes = new Uint8Array(content);
  const n = bytes.length;
  const padLen = n % 64 < 56 ? 56 - (n % 64) : 120 - (n % 64);
  const padded = new Uint8Array(n + padLen + 8);
  padded.set(bytes);
  padded[n] = 0x80;
  const bitLen = n * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, u32(bitLen), true);
  view.setUint32(padded.length - 4, Math.floor(bitLen / 0x100000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = new Uint32Array(16);
    for (let j = 0; j < 16; j++) {
      words[j] = view.getUint32(offset + j * 4, true);
    }
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f = 0;
      let g = 0;
      if (i < 16) {
        f = u32((b & c) | (~b & d));
        g = i;
      } else if (i < 32) {
        f = u32((d & b) | (~d & c));
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = u32(b ^ c ^ d);
        g = (3 * i + 5) % 16;
      } else {
        f = u32(c ^ (b | ~d));
        g = (7 * i) % 16;
      }
      const next = u32(
        b + rotl32(u32(a + f + MD5_K[i] + words[g]), MD5_SHIFT[i])
      );
      a = d;
      d = c;
      c = b;
      b = next;
    }
    a0 = u32(a0 + a);
    b0 = u32(b0 + b);
    c0 = u32(c0 + c);
    d0 = u32(d0 + d);
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);
  return arrayBufferToHex(out.buffer);
};

const sha256Hex = async (content: ArrayBuffer): Promise<string> => {
  const digest = await window.crypto.subtle.digest("SHA-256", content);
  return arrayBufferToHex(digest);
};

/**
 * Dropbox content hash: SHA-256 of the concatenation of per-4MiB SHA-256 blocks.
 * An empty file hashes zero blocks, which is SHA-256 of empty bytes.
 */
export const dropboxContentHashHex = async (
  content: ArrayBuffer
): Promise<string> => {
  const bytes = new Uint8Array(content);
  const blockHashes: Uint8Array[] = [];
  for (
    let offset = 0;
    offset < bytes.length;
    offset += DROPBOX_CONTENT_HASH_BLOCK_SIZE
  ) {
    const end = Math.min(
      offset + DROPBOX_CONTENT_HASH_BLOCK_SIZE,
      bytes.length
    );
    const block = bytes.slice(offset, end);
    const digest = new Uint8Array(
      await window.crypto.subtle.digest("SHA-256", block)
    );
    blockHashes.push(digest);
  }
  const combined = new Uint8Array(blockHashes.length * 32);
  for (let i = 0; i < blockHashes.length; i++) {
    combined.set(blockHashes[i], i * 32);
  }
  return sha256Hex(combined.buffer);
};

export const computeContentHash = async (
  kind: ContentHashKind,
  content: ArrayBuffer
): Promise<string | undefined> => {
  switch (kind) {
    case "sha1":
      return await getSha1(content, "hex");
    case "sha256":
      return await sha256Hex(content);
    case "md5":
      return md5Hex(content);
    case "dropbox-content-hash":
      return await dropboxContentHashHex(content);
    case "unsupported":
      return undefined;
    default:
      return undefined;
  }
};

const entityReadKey = (entity: Entity): string => {
  const key = entity.key ?? entity.keyRaw;
  if (key === undefined || key === "") {
    throw Error("content hash recheck missing file key");
  }
  return key;
};

/**
 * Reuse a hash saved on the previous sync record when this side's mtime and
 * size still match that record. That is the same trust the mtime+size path
 * already uses, so we do not read the file again.
 */
export const reusePrevSyncContentHash = (
  entity: Entity,
  prevSync: Entity | undefined,
  which: "local" | "remote"
): boolean => {
  if (prevSync === undefined || hasContentHash(entity.hash)) {
    return false;
  }
  if (!hasContentHash(prevSync.hash)) {
    return false;
  }
  if (
    typeof entity.sizeEnc !== "number" ||
    entity.sizeEnc !== prevSync.sizeEnc
  ) {
    return false;
  }

  if (which === "local") {
    if (
      entity.mtimeCli !== undefined &&
      entity.mtimeCli === prevSync.mtimeCli
    ) {
      entity.hash = prevSync.hash;
      return true;
    }
    return false;
  }

  const remoteMtime = entity.mtimeSvr ?? entity.mtimeCli;
  if (
    prevSync.mtimeSvr !== undefined &&
    remoteMtime !== undefined &&
    (prevSync.mtimeSvr === entity.mtimeSvr ||
      prevSync.mtimeSvr === entity.mtimeCli)
  ) {
    entity.hash = prevSync.hash;
    return true;
  }
  return false;
};

/**
 * Fill missing hashes in place.
 *
 * Skipped entirely when encryption is on.
 * Does not read a file when mtime+size already match, when both hashes are
 * already present, when sizes differ, or when prevSync already has a hash
 * for this mtime+size.
 * When a read is required, only the side missing a hash is read.
 */
export const fillMissingContentHashesInplace = async (
  mappings: Record<string, MixedEntity>,
  options: {
    password?: string;
    serviceType: SUPPORTED_SERVICES_TYPE;
    readLocal?: (key: string) => Promise<ArrayBuffer>;
    readRemote?: (key: string) => Promise<ArrayBuffer>;
  }
): Promise<ContentHashFillStats> => {
  const stats: ContentHashFillStats = {
    cacheHits: 0,
    localReads: 0,
    remoteReads: 0,
  };
  if (encryptionBlocksContentHash(options.password)) {
    return stats;
  }

  const kind = contentHashKindForService(options.serviceType);
  const readLocal = options.readLocal;
  const readRemote = options.readRemote;

  for (const [key, entry] of Object.entries(mappings)) {
    if (key.endsWith("/") || key === "/$@meta") {
      continue;
    }
    const { local, remote, prevSync } = entry;
    if (local === undefined || remote === undefined) {
      continue;
    }
    if (mtimeAndSizeEncEqual(local, remote)) {
      continue;
    }
    if (contentHashesEqual(local.hash, remote.hash)) {
      continue;
    }
    if (hasContentHash(local.hash) && hasContentHash(remote.hash)) {
      continue;
    }
    if (!sizesMatchForContentHashRead(local, remote)) {
      continue;
    }

    if (reusePrevSyncContentHash(local, prevSync, "local")) {
      stats.cacheHits += 1;
    }
    if (reusePrevSyncContentHash(remote, prevSync, "remote")) {
      stats.cacheHits += 1;
    }
    if (hasContentHash(local.hash) && hasContentHash(remote.hash)) {
      continue;
    }
    if (
      readLocal === undefined ||
      readRemote === undefined ||
      kind === "unsupported"
    ) {
      continue;
    }

    try {
      if (!hasContentHash(local.hash)) {
        const bytes = await readLocal(entityReadKey(local));
        stats.localReads += 1;
        const hash = await computeContentHash(kind, bytes);
        if (hash !== undefined) {
          local.hash = hash;
        }
      }
      if (!hasContentHash(remote.hash)) {
        const bytes = await readRemote(entityReadKey(remote));
        stats.remoteReads += 1;
        const hash = await computeContentHash(kind, bytes);
        if (hash !== undefined) {
          remote.hash = hash;
        }
      }
    } catch (err) {
      console.debug(
        `content hash recheck skipped for ${key}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  if (stats.localReads > 0 || stats.remoteReads > 0 || stats.cacheHits > 0) {
    console.debug(
      `content hash recheck: cacheHits=${stats.cacheHits} localReads=${stats.localReads} remoteReads=${stats.remoteReads}`
    );
  }
  return stats;
};

/**
 * Prev-sync record after a hash-equal decision.
 * Stores the matched hash plus the current mtimes so the next sync can reuse
 * the hash instead of reading the files again.
 */
export const contentHashEqualPrevSyncRecord = (
  local: Entity,
  remote: Entity,
  prevSync: Entity | undefined
): Entity => {
  const base: Entity = Object.assign({}, prevSync ?? remote);
  base.hash = local.hash ?? remote.hash ?? base.hash;
  base.mtimeCli = local.mtimeCli ?? base.mtimeCli;
  base.mtimeSvr = remote.mtimeSvr ?? remote.mtimeCli ?? base.mtimeSvr;
  base.sizeEnc = remote.sizeEnc ?? local.sizeEnc ?? base.sizeEnc;
  if (remote.size !== undefined) {
    base.size = remote.size;
  }
  if (remote.sizeRaw !== undefined) {
    base.sizeRaw = remote.sizeRaw;
  }
  if (base.key === undefined) {
    base.key = local.key ?? remote.key;
  }
  if (base.keyRaw === undefined || base.keyRaw === "") {
    base.keyRaw = local.keyRaw || remote.keyRaw;
  }
  return base;
};
