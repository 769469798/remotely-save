import { strict as assert } from "assert";
import type {
  Entity,
  MixedEntity,
  RemotelySavePluginSettings,
} from "../../src/baseTypes";
import { computeContentHash } from "../../src/contentHash";
import {
  getSyncPlanInplace,
  splitFourStepsOnEntityMappings,
} from "../src/sync";

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

const settingsFor = (
  over: Partial<RemotelySavePluginSettings> = {}
): RemotelySavePluginSettings => {
  return {
    password: "",
    serviceType: "dropbox",
    concurrency: 1,
    protectModifyPercentage: 50,
    syncConfigDir: false,
    syncBookmarks: false,
    syncUnderscoreItems: false,
    skipSizeLargerThan: -1,
    conflictAction: "keep_newer",
    ...over,
  } as RemotelySavePluginSettings;
};

const plan = async (
  entries: Record<string, MixedEntity>,
  settings = settingsFor(),
  readers?: {
    readLocal: (key: string) => Promise<ArrayBuffer>;
    readRemote: (key: string) => Promise<ArrayBuffer>;
  }
) => {
  return await getSyncPlanInplace(
    entries,
    -1,
    "keep_newer",
    "bidirectional",
    undefined,
    settings,
    "manual",
    ".obsidian",
    readers
  );
};

describe("sync plan content hash equality", () => {
  beforeEach(() => {
    global.window = {
      crypto: require("crypto").webcrypto,
      moment: () => ({
        toISOString: () => "2026-01-01T00:00:00.000Z",
        format: () => "2026-01-01T00:00:00Z",
      }),
    } as any;
  });

  it("keeps mtime+size equality on branch 2 without hashes", async () => {
    const mappings = await plan({
      "a.md": {
        key: "a.md",
        local: file({ key: "a.md", mtimeCli: 2000, sizeEnc: 4 }),
        remote: file({
          key: "a.md",
          mtimeCli: 2000,
          mtimeSvr: 1500,
          sizeEnc: 4,
        }),
      },
    });
    assert.equal(mappings["a.md"].decisionBranch, 2);
    assert.equal(mappings["a.md"].decision, "equal");
    assert.equal(mappings["a.md"].change, false);
  });

  it("stays branch 2 when mtime+size match even if hashes differ", async () => {
    const mappings = await plan({
      "a.md": {
        key: "a.md",
        local: file({ key: "a.md", mtimeCli: 2000, sizeEnc: 4, hash: "aaa" }),
        remote: file({
          key: "a.md",
          mtimeCli: 2000,
          mtimeSvr: 2000,
          sizeEnc: 4,
          hash: "bbb",
        }),
      },
    });
    assert.equal(mappings["a.md"].decisionBranch, 2);
    assert.equal(mappings["a.md"].decision, "equal");
    assert.equal(mappings["a.md"].change, false);
  });

  it("treats different mtime and the same content hash as equal", async () => {
    // Local mtime was rewritten. Remote is unchanged vs prevSync, so without
    // a hash this would be branch 10 (local modified, push) and would count
    // toward modify-protection.
    const mappings = await plan({
      "a.md": {
        key: "a.md",
        local: file({ key: "a.md", mtimeCli: 9000, sizeEnc: 4, hash: "ab" }),
        remote: file({
          key: "a.md",
          mtimeCli: 1000,
          mtimeSvr: 1000,
          sizeEnc: 4,
          hash: "AB",
        }),
        prevSync: file({
          key: "a.md",
          mtimeCli: 1000,
          mtimeSvr: 1000,
          sizeEnc: 4,
          hash: "ab",
        }),
      },
    });
    assert.equal(mappings["a.md"].decisionBranch, 40);
    assert.equal(mappings["a.md"].decision, "equal");
    assert.equal(mappings["a.md"].change, false);

    const counts = splitFourStepsOnEntityMappings(mappings);
    assert.equal(counts.allFilesCount, 1);
    assert.equal(counts.realModifyDeleteCount, 0);
  });

  it("does not count a vault of hash-equal files as modified", async () => {
    const entries: Record<string, MixedEntity> = {};
    for (let i = 0; i < 10; i++) {
      const key = `note-${i}.md`;
      entries[key] = {
        key,
        local: file({ key, mtimeCli: 8000 + i, sizeEnc: 4, hash: "h" }),
        remote: file({
          key,
          mtimeCli: 1000,
          mtimeSvr: 1000,
          sizeEnc: 4,
          hash: "h",
        }),
        prevSync: file({
          key,
          mtimeCli: 1000,
          mtimeSvr: 1000,
          sizeEnc: 4,
        }),
      };
    }
    entries["really-edited.md"] = {
      key: "really-edited.md",
      local: file({
        key: "really-edited.md",
        mtimeCli: 9000,
        sizeEnc: 4,
        hash: "local-changed",
      }),
      remote: file({
        key: "really-edited.md",
        mtimeCli: 1000,
        mtimeSvr: 1000,
        sizeEnc: 4,
        hash: "remote-old",
      }),
      prevSync: file({
        key: "really-edited.md",
        mtimeCli: 1000,
        mtimeSvr: 1000,
        sizeEnc: 4,
        hash: "remote-old",
      }),
    };

    const mappings = await plan(entries);
    for (let i = 0; i < 10; i++) {
      assert.equal(mappings[`note-${i}.md`].decision, "equal");
      assert.equal(mappings[`note-${i}.md`].change, false);
    }
    assert.equal(mappings["really-edited.md"].decisionBranch, 10);
    assert.equal(mappings["really-edited.md"].change, true);

    const counts = splitFourStepsOnEntityMappings(mappings);
    assert.equal(counts.allFilesCount, 11);
    assert.equal(counts.realModifyDeleteCount, 1);
  });

  it("does not use hashes when a password is set", async () => {
    const mappings = await plan(
      {
        "a.md": {
          key: "a.md",
          local: file({
            key: "a.md",
            mtimeCli: 9000,
            sizeEnc: 4,
            hash: "same",
          }),
          remote: file({
            key: "a.md",
            mtimeCli: 1000,
            mtimeSvr: 1000,
            sizeEnc: 4,
            hash: "same",
          }),
          prevSync: file({
            key: "a.md",
            mtimeCli: 1000,
            mtimeSvr: 1000,
            sizeEnc: 4,
          }),
        },
      },
      settingsFor({ password: "secret" })
    );
    assert.notEqual(mappings["a.md"].decision, "equal");
    assert.equal(mappings["a.md"].decisionBranch, 10);
    assert.equal(mappings["a.md"].change, true);
    const counts = splitFourStepsOnEntityMappings(mappings);
    assert.equal(counts.realModifyDeleteCount, 1);
  });

  it("does not treat a one-sided hash as equal", async () => {
    const mappings = await plan({
      "a.md": {
        key: "a.md",
        local: file({ key: "a.md", mtimeCli: 9000, sizeEnc: 4 }),
        remote: file({
          key: "a.md",
          mtimeCli: 1000,
          mtimeSvr: 1000,
          sizeEnc: 4,
          hash: "only-remote",
        }),
        prevSync: file({
          key: "a.md",
          mtimeCli: 1000,
          mtimeSvr: 1000,
          sizeEnc: 4,
        }),
      },
    });
    assert.equal(mappings["a.md"].decisionBranch, 10);
    assert.equal(mappings["a.md"].change, true);
  });

  it("fills a Dropbox hash during planning and then marks the file equal", async () => {
    const bytes = text("vault note");
    const remoteHash = await computeContentHash("dropbox-content-hash", bytes);
    let localReads = 0;
    let remoteReads = 0;
    const mappings = await plan(
      {
        "a.md": {
          key: "a.md",
          local: file({
            key: "a.md",
            mtimeCli: 9000,
            sizeEnc: bytes.byteLength,
          }),
          remote: file({
            key: "a.md",
            mtimeCli: 1000,
            mtimeSvr: 1000,
            sizeEnc: bytes.byteLength,
            hash: remoteHash,
          }),
          prevSync: file({
            key: "a.md",
            mtimeCli: 1000,
            mtimeSvr: 1000,
            sizeEnc: bytes.byteLength,
          }),
        },
      },
      settingsFor({ serviceType: "dropbox" }),
      {
        readLocal: async () => {
          localReads += 1;
          return bytes;
        },
        readRemote: async () => {
          remoteReads += 1;
          return bytes;
        },
      }
    );
    assert.equal(localReads, 1);
    assert.equal(remoteReads, 0);
    assert.equal(mappings["a.md"].decisionBranch, 40);
    assert.equal(mappings["a.md"].decision, "equal");
    assert.equal(mappings["a.md"].change, false);
    const counts = splitFourStepsOnEntityMappings(mappings);
    assert.equal(counts.realModifyDeleteCount, 0);
  });

  it("does not treat same-size different bytes as equal", async () => {
    const mappings = await plan(
      {
        "a.md": {
          key: "a.md",
          local: file({ key: "a.md", mtimeCli: 9000, sizeEnc: 4 }),
          remote: file({
            key: "a.md",
            mtimeCli: 1000,
            mtimeSvr: 1000,
            sizeEnc: 4,
          }),
          prevSync: file({
            key: "a.md",
            mtimeCli: 1000,
            mtimeSvr: 1000,
            sizeEnc: 4,
          }),
        },
      },
      settingsFor({ serviceType: "webdav" }),
      {
        readLocal: async () => text("aaaa"),
        readRemote: async () => text("bbbb"),
      }
    );
    assert.equal(mappings["a.md"].decisionBranch, 10);
    assert.equal(mappings["a.md"].change, true);
    const counts = splitFourStepsOnEntityMappings(mappings);
    assert.equal(counts.realModifyDeleteCount, 1);
  });
});
