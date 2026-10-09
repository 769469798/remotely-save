import { strict as assert } from "assert";
import type { Entity, MixedEntity } from "../src/baseTypes";
import {
  DROPBOX_CONTENT_HASH_BLOCK_SIZE,
  computeContentHash,
  contentHashEqualPrevSyncRecord,
  contentHashesEqual,
  encryptionBlocksContentHash,
  fillMissingContentHashesInplace,
  mtimeAndSizeEncEqual,
  normalizeContentHash,
  sizesMatchForContentHashRead,
} from "../src/contentHash";

const text = (s: string) => new TextEncoder().encode(s).buffer;

const file = (over: Partial<Entity> & { key: string }): Entity => {
  const size = over.sizeEnc ?? over.size ?? over.sizeRaw ?? 4;
  return {
    key: over.key,
    keyRaw: over.key,
    mtimeCli: 1000,
    mtimeSvr: 1000,
    size,
    sizeEnc: size,
    sizeRaw: size,
    ...over,
  };
};

describe("content hash helpers", () => {
  beforeEach(() => {
    global.window = {
      crypto: require("crypto").webcrypto,
    } as any;
  });

  it("treats missing or blank hashes as not equal", () => {
    assert.equal(contentHashesEqual(undefined, undefined), false);
    assert.equal(contentHashesEqual("abc", undefined), false);
    assert.equal(contentHashesEqual("", "abc"), false);
    assert.equal(contentHashesEqual("  ", "abc"), false);
    assert.equal(normalizeContentHash('"abc"'), "abc");
  });

  it("compares hex hashes case-insensitively", () => {
    assert.equal(contentHashesEqual("AbC", "abc"), true);
    assert.equal(contentHashesEqual("abc", "abd"), false);
    // Not hex, so case is significant.
    assert.equal(contentHashesEqual("same", "SAME"), false);
  });

  it("keeps the mtime+size fast path", () => {
    const local = file({ key: "a.md", mtimeCli: 2000, sizeEnc: 4 });
    const remote = file({
      key: "a.md",
      mtimeCli: 2000,
      mtimeSvr: 1500,
      sizeEnc: 4,
    });
    assert.equal(mtimeAndSizeEncEqual(local, remote), true);
    const remoteSvr = file({
      key: "a.md",
      mtimeCli: 1,
      mtimeSvr: 2000,
      sizeEnc: 4,
    });
    assert.equal(mtimeAndSizeEncEqual(local, remoteSvr), true);
    const differentSize = file({ key: "a.md", mtimeCli: 2000, sizeEnc: 5 });
    assert.equal(mtimeAndSizeEncEqual(local, differentSize), false);
    assert.equal(sizesMatchForContentHashRead(local, differentSize), false);
  });

  it("blocks the recheck when a password is set", () => {
    assert.equal(encryptionBlocksContentHash(""), false);
    assert.equal(encryptionBlocksContentHash(undefined), false);
    assert.equal(encryptionBlocksContentHash("secret"), true);
  });

  it("matches known sha1, sha256, and md5 vectors", async () => {
    const abc = text("abc");
    assert.equal(
      await computeContentHash("sha1", abc),
      "a9993e364706816aba3e25717850c26c9cd0d89d"
    );
    assert.equal(
      await computeContentHash("sha256", abc),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    assert.equal(
      await computeContentHash("md5", abc),
      "900150983cd24fb0d6963f7d28e17f72"
    );
    assert.equal(
      await computeContentHash("md5", text("")),
      "d41d8cd98f00b204e9800998ecf8427e"
    );
    assert.equal(
      await computeContentHash("md5", text("a")),
      "0cc175b9c0f1b6a831c399e269772661"
    );
  });

  it("matches Dropbox content hash for empty, small, and multi-block input", async () => {
    assert.equal(
      await computeContentHash("dropbox-content-hash", text("")),
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    assert.equal(
      await computeContentHash("dropbox-content-hash", text("hello")),
      "9595c9df90075148eb06860365df33584b75bff782a510c6cd4883a419833d50"
    );
    const big = new Uint8Array(DROPBOX_CONTENT_HASH_BLOCK_SIZE + 5);
    big.fill(7);
    assert.equal(
      await computeContentHash("dropbox-content-hash", big.buffer),
      "a8cbe1823c43d0f6cfc1093cd1b61ded18b3e259f1683e2fb5f45780395dd258"
    );
  });

  it("does not read when mtime+size match, sizes differ, or both hashes exist", async () => {
    let reads = 0;
    const read = async () => {
      reads += 1;
      return text("same");
    };
    const sameMtime: Record<string, MixedEntity> = {
      "a.md": {
        key: "a.md",
        local: file({ key: "a.md", mtimeCli: 5, sizeEnc: 4 }),
        remote: file({ key: "a.md", mtimeCli: 5, mtimeSvr: 5, sizeEnc: 4 }),
      },
    };
    const diffSize: Record<string, MixedEntity> = {
      "b.md": {
        key: "b.md",
        local: file({ key: "b.md", mtimeCli: 5, sizeEnc: 4 }),
        remote: file({ key: "b.md", mtimeCli: 9, sizeEnc: 8 }),
      },
    };
    const bothHashes: Record<string, MixedEntity> = {
      "c.md": {
        key: "c.md",
        local: file({ key: "c.md", mtimeCli: 5, sizeEnc: 4, hash: "aa" }),
        remote: file({ key: "c.md", mtimeCli: 9, sizeEnc: 4, hash: "bb" }),
      },
    };
    await fillMissingContentHashesInplace(
      { ...sameMtime, ...diffSize, ...bothHashes },
      {
        password: "",
        serviceType: "webdav",
        readLocal: read,
        readRemote: read,
      }
    );
    assert.equal(reads, 0);
    assert.equal(bothHashes["c.md"].local?.hash, "aa");
    assert.equal(bothHashes["c.md"].remote?.hash, "bb");
  });

  it("does not invent hashes when encryption is on", async () => {
    let reads = 0;
    const mappings: Record<string, MixedEntity> = {
      "a.md": {
        key: "a.md",
        local: file({ key: "a.md", mtimeCli: 5, sizeEnc: 4 }),
        remote: file({ key: "a.md", mtimeCli: 9, sizeEnc: 4 }),
      },
    };
    const stats = await fillMissingContentHashesInplace(mappings, {
      password: "secret",
      serviceType: "dropbox",
      readLocal: async () => {
        reads += 1;
        return text("same");
      },
      readRemote: async () => {
        reads += 1;
        return text("same");
      },
    });
    assert.equal(reads, 0);
    assert.equal(stats.localReads, 0);
    assert.equal(mappings["a.md"].local?.hash, undefined);
    assert.equal(mappings["a.md"].remote?.hash, undefined);
  });

  it("hashes only the local file when Dropbox already has content_hash", async () => {
    const bytes = text("hello");
    const remoteHash = await computeContentHash("dropbox-content-hash", bytes);
    let localReads = 0;
    let remoteReads = 0;
    const mappings: Record<string, MixedEntity> = {
      "a.md": {
        key: "a.md",
        local: file({ key: "a.md", mtimeCli: 5000, sizeEnc: 5 }),
        remote: file({
          key: "a.md",
          mtimeCli: 1000,
          mtimeSvr: 1000,
          sizeEnc: 5,
          hash: remoteHash,
        }),
      },
    };
    const stats = await fillMissingContentHashesInplace(mappings, {
      password: "",
      serviceType: "dropbox",
      readLocal: async () => {
        localReads += 1;
        return bytes;
      },
      readRemote: async () => {
        remoteReads += 1;
        return bytes;
      },
    });
    assert.equal(localReads, 1);
    assert.equal(remoteReads, 0);
    assert.equal(stats.remoteReads, 0);
    assert.equal(
      contentHashesEqual(mappings["a.md"].local?.hash, remoteHash),
      true
    );
  });

  it("hashes both sides for webdav when neither hash is present", async () => {
    const bytes = text("same-note");
    let localReads = 0;
    let remoteReads = 0;
    const mappings: Record<string, MixedEntity> = {
      "a.md": {
        key: "a.md",
        local: file({ key: "a.md", mtimeCli: 5000, sizeEnc: 9 }),
        remote: file({
          key: "a.md",
          mtimeCli: 1000,
          mtimeSvr: 1000,
          sizeEnc: 9,
        }),
      },
    };
    await fillMissingContentHashesInplace(mappings, {
      password: "",
      serviceType: "webdav",
      readLocal: async () => {
        localReads += 1;
        return bytes;
      },
      readRemote: async () => {
        remoteReads += 1;
        return bytes;
      },
    });
    assert.equal(localReads, 1);
    assert.equal(remoteReads, 1);
    assert.equal(
      contentHashesEqual(
        mappings["a.md"].local?.hash,
        mappings["a.md"].remote?.hash
      ),
      true
    );
    const expected = await computeContentHash("sha1", bytes);
    assert.equal(mappings["a.md"].local?.hash, expected);
  });

  it("does not recompute pCloud's proprietary hash", async () => {
    let reads = 0;
    const mappings: Record<string, MixedEntity> = {
      "a.md": {
        key: "a.md",
        local: file({ key: "a.md", mtimeCli: 5000, sizeEnc: 4 }),
        remote: file({
          key: "a.md",
          mtimeCli: 1000,
          sizeEnc: 4,
          hash: "987654321",
        }),
      },
    };
    await fillMissingContentHashesInplace(mappings, {
      password: "",
      serviceType: "pcloud",
      readLocal: async () => {
        reads += 1;
        return text("same");
      },
      readRemote: async () => {
        reads += 1;
        return text("same");
      },
    });
    assert.equal(reads, 0);
    assert.equal(mappings["a.md"].local?.hash, undefined);
  });

  it("reuses a cached hash when mtime and size still match", async () => {
    let reads = 0;
    const mappings: Record<string, MixedEntity> = {
      "a.md": {
        key: "a.md",
        local: file({ key: "a.md", mtimeCli: 5000, sizeEnc: 4 }),
        remote: file({
          key: "a.md",
          mtimeCli: 1000,
          mtimeSvr: 1000,
          sizeEnc: 4,
          hash: "cached-hash",
        }),
        prevSync: file({
          key: "a.md",
          mtimeCli: 5000,
          mtimeSvr: 1000,
          sizeEnc: 4,
          hash: "cached-hash",
        }),
      },
    };
    const stats = await fillMissingContentHashesInplace(mappings, {
      password: "",
      serviceType: "dropbox",
      readLocal: async () => {
        reads += 1;
        return text("same");
      },
      readRemote: async () => {
        reads += 1;
        return text("same");
      },
    });
    assert.equal(reads, 0);
    assert.equal(stats.cacheHits, 1);
    assert.equal(mappings["a.md"].local?.hash, "cached-hash");
  });

  it("records the new mtime and the matched hash for the next sync", () => {
    const local = file({
      key: "a.md",
      mtimeCli: 5000,
      sizeEnc: 4,
      hash: "abc",
    });
    const remote = file({
      key: "a.md",
      mtimeCli: 1000,
      mtimeSvr: 1100,
      sizeEnc: 4,
      hash: "abc",
    });
    const prev = file({
      key: "a.md",
      keyEnc: "enc-name",
      mtimeCli: 1000,
      mtimeSvr: 1100,
      sizeEnc: 4,
    });
    const saved = contentHashEqualPrevSyncRecord(local, remote, prev);
    assert.equal(saved.hash, "abc");
    assert.equal(saved.mtimeCli, 5000);
    assert.equal(saved.mtimeSvr, 1100);
    assert.equal(saved.sizeEnc, 4);
    assert.equal(saved.keyEnc, "enc-name");
  });
});
