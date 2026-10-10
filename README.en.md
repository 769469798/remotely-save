# Remotely Save (personal fork)

[简体中文](./README.md)

This repository, [769469798/remotely-save](https://github.com/769469798/remotely-save), is a personal fork of [remotely-save/remotely-save](https://github.com/remotely-save/remotely-save) by fyears.

The Obsidian community plugin id `remotely-save` installs the **upstream** plugin. Use the steps below for this fork.

## What this fork changes

- **No Remotely Save account and no PRO payment.** Smart Conflict and the former PRO remotes are unlocked: OneDrive (Full), Google Drive, Box, pCloud, Yandex Disk, Koofr, and Azure Blob Storage. Each service still uses that service's own authorization.
- **Simplified Chinese UI.** Settings and messages are Simplified Chinese, with English when a string has no Chinese entry. Service names and technical terms stay in English (WebDAV, S3, Dropbox, mtime, hash, and so on).
- **Equal content hashes mean equal files.** Copying a vault, unzipping it, or a cloud client often rewrites mtime and leaves the bytes unchanged. When both content hashes are present and equal, the sync plan stays equal (branch 40) and is not counted by modify protection. See [content hash recheck](./docs/sync_algorithm/content_hash_recheck.md). End-to-end encryption (non-empty password) does not use this comparison. The item-by-item comparison with upstream is [Differences from upstream](#upstream-diff).

<a id="upstream-diff"></a>

## Differences from upstream

| | Old (upstream) | New (this fork) |
| --- | --- | --- |
| Repo | [remotely-save/remotely-save](https://github.com/remotely-save/remotely-save). The Obsidian community plugin id `remotely-save` installs that build. | [769469798/remotely-save](https://github.com/769469798/remotely-save). |
| When both copies exist, what counts as equal | mtime + `sizeEnc` only. A match is branch 2. This repo's docs describe that as the plan from before content hash recheck. | mtime + `sizeEnc` still wins (branch 2). If that fails and both content hashes exist and are equal, the plan is still equal (branch 40). |
| A bulk pull or unzip rewrites mtime | Unchanged bytes leave the equal path. Many files become modifications or conflicts, count toward `protectModifyPercentage`, and often abort at the default of 50%. | Files whose hashes match stay equal and are not counted by modify protection. |
| Source | The pre-recheck path in [content hash recheck](./docs/sync_algorithm/content_hash_recheck.md), and the branch tables in [v3 design](./docs/sync_algorithm/v3/design.md). | Current code: `src/contentHash.ts`, `getSyncPlanInplace` in `pro/src/sync.ts`, and those two docs. |

Push, pull, and conflicts are still sync algorithm v3. WebDAV does not have a second planner. When the selected remote is WebDAV, the second section below is its bidirectional rule.

### Hash check (content hash recheck)

Full rules: [docs/sync_algorithm/content_hash_recheck.md](./docs/sync_algorithm/content_hash_recheck.md). Branch numbers: [docs/sync_algorithm/v3/design.md](./docs/sync_algorithm/v3/design.md).

**Old.** When both copies exist, the plan is equal (branch 2) only when client mtime matches the remote `mtimeCli` or `mtimeSvr` and `sizeEnc` matches. A bulk pull, unzip, vault copy, or cloud client often rewrites mtime and leaves the bytes alone. Once mtime disagrees, the file is a one-sided modification (push or pull) or a conflict, compared with the last successful sync. Those decisions count toward `protectModifyPercentage`. The doc's example: about 152 of about 154 files judged modified (about 98.7%). The default protection aborts even though the note bytes did not change.

**New.** The fast path is unchanged. mtime + `sizeEnc` matching is branch 2, `change = false`. No hash is required and the file is not read. If that check fails, the encryption password is empty, and both content hashes are present and equal, the plan is still equal with `change = false`. That is branch 40. Branch 40 is not a modification and not a deletion, so modify protection does not count it.

Branch 40 does not apply when:

- Either hash is missing. An empty string counts as missing.
- The hashes differ. Hex compares case-insensitively. A non-hex hash is compared as-is, case-sensitively.
- `sizeEnc` already differs. Different lengths are not hashed. If both sides lack `sizeEnc`, `size` is compared instead. A size mismatch is not read.

**When bytes are read.** Hashes are not computed for every file on every sync. `fillMissingContentHashesInplace` does this, in order:

1. Non-empty encryption password: the recheck returns immediately. No reads and no hash equality. With a non-empty password, `FakeFsEncrypt` sets `hash` to `undefined`, because a provider hash describes ciphertext, not the note in the vault. The recheck does not hash plaintext, does not hash ciphertext, and does not store an invented hash on the previous-sync record. Turning encryption off later cannot trip over a hash this feature wrote, because it never wrote one.
2. mtime + `sizeEnc` already match: skip.
3. Both hashes are already present (from the listing, or copied from the previous-sync record): compare only, no read. Equal hashes skip the rest. Two present but different hashes also skip the read; the later modify/conflict path handles them.
4. Sizes differ: skip.
5. Otherwise, read only the side that is still missing a hash. pCloud's kind is `unsupported`, so this step does not read or hash it either. The previous successful sync is a cache. If this side's mtime and `sizeEnc` still match that record and the record has a hash, the hash is copied and the file is not read. The local cache checks `mtimeCli`. The remote cache checks that the record's `mtimeSvr` equals this side's `mtimeSvr` or `mtimeCli`.

Branch 40 writes the matched hash and the current mtimes back to the previous-sync record only when a sync actually runs. A dry run still builds the plan (and may download in order to hash), but `triggerSource === "dry"` skips `doActualSync` and does not write that record. The next everyday sync can skip the read only after one successful non-dry sync.

**Which hash.** From `contentHashKindForService`:

| Service | `Entity.hash` from the listing | What this plugin computes when a hash is missing |
| --- | --- | --- |
| Dropbox | Content hash: SHA-256 of each 4 MiB block, then SHA-256 of those block hashes concatenated | Same algorithm on local bytes. The remote hash comes from the listing, so the recheck does not download the remote for this |
| Box | SHA-1 hex (`sha1`) | SHA-1 |
| Yandex Disk | SHA-256 hex (`sha256`) | SHA-256 |
| Google Drive | MD5 hex (`md5Checksum`) | MD5 |
| Koofr | The listing `hash`. Samples in the docs are 32 hex digits, treated as MD5 | MD5. If a Koofr hash is not MD5, it will not match and the file stays on the mtime+size path |
| Azure Blob | `contentMD5`, hex-encoded | MD5 |
| pCloud | The proprietary numeric `hash`, stored as a string | Not recomputed (`unsupported`). Equal only when both sides already carry the same string |
| S3, WebDAV, OneDrive, OneDrive (Full), Webdis | None. S3 stores `etag`; the recheck does not read `etag`. OneDrive hash is still a TODO in source | SHA-1 of both sides. The missing side is read; a missing remote hash downloads the remote file |

**What the WebDAV hash path costs.** `fromWebdavItemToEntity` records `lastmod` and size. It does not set `hash`. WebDAV's recheck kind is SHA-1. When mtime+size failed, the sizes match, the password is empty, and the previous record cannot fill both hashes, planning reads the local file and downloads the remote through `readRemote` (`fsEncrypt.readFile`) to SHA-1 it. That download happens before upload, pull, and delete. Files are awaited one by one. The concurrency setting is not used here. A dry run downloads too, because it still builds the plan.

The first time a whole-vault mtime rewrite shows up, and the previous record has no hash, every such same-size file may be downloaded. Matching SHA-1 values become branch 40 and stay out of the modify ratio. After a real sync succeeds, the record holds the hash and those mtimes. Later syncs reuse the hash, with no read and no download, while that side's mtime and `sizeEnc` still match the record.

A WebDAV-only provider that does not return a content hash, including 123 Pan (123云盘) used as WebDAV, follows this path. This repo has no 123 Pan client of its own. Practical consequences:

- Leave the end-to-end encryption password empty if you want this recheck. With a password, WebDAV compares mtime and encrypted size only.
- Expect an extra download the first time, and again whenever the cache misses. The cache misses when that side's mtime or `sizeEnc` no longer matches the previous record. If a WebDAV server rewrites `lastmod` on every listing, the download repeats. This repo has no special case for that server.
- To avoid downloading the remote during the recheck, use a service whose listing already has a hash: Dropbox, Box, Yandex Disk, Google Drive, Koofr, or Azure Blob. Those remote hashes come from the listing; the missing side is usually local.

### WebDAV bidirectional sync

One planner: `getSyncPlanInplace`. Default `syncDirection` is `bidirectional`. Default `conflictAction` is `keep_newer`. The settings label sync direction as experimental. The direction tables are in [v3 design](./docs/sync_algorithm/v3/design.md).

**One remote.** Settings expose a single "choose a remote" dropdown (`serviceType`). WebDAV has one config: address, username, password, and `remoteBaseDir`. A sync uses whichever service is selected. Configuring several WebDAV endpoints and syncing them at the same time is not implemented. Several devices mean several installs pointed at the same WebDAV, syncing both ways through that one remote. The plugin does not connect device A directly to device B.

**What "unchanged" means.** Folders ignore mtime, size, and hash. They only check existence. Files take the equal test from the previous section first (branch 2, branch 40, and branch 21 when both sides still match the previous record). Equal does nothing in every direction, with `change = false`.

After that, the file is compared with the last successful sync record:

- Local unchanged: `prevSync.mtimeCli === local.mtimeCli` and `sizeEnc` matches.
- Remote unchanged: `prevSync.mtimeSvr` equals the remote `mtimeCli` or `mtimeSvr`, and `sizeEnc` matches.
- With no previous record, a file on only one side is created. A file on both sides that is not equal is "both created", not "both modified".

A WebDAV listing writes `lastmod` into both `mtimeCli` and `mtimeSvr` on the remote entity. The source notes there is no universal way to set a separate client mtime on WebDAV. With an empty password, `sizeEnc` is the listing's `sizeRaw`.

In the table below, "keep local" writes the local file to the remote. "Keep remote" writes the remote file to the local vault. `conflictAction` is used only for bidirectional sync, and only on the last row. One-way directions ignore that setting.

| Case | Bidirectional | Incremental push | Push and delete | Incremental pull | Pull and delete |
| --- | --- | --- | --- | --- | --- |
| Local create only | Push (6) | Push (6) | Push (6) | Nothing (31) | Nothing (31) |
| Remote create only | Pull (3) | Nothing (28) | Nothing (28) | Pull (3) | Pull (3) |
| Only local changed | Push (10) | Push (10) | Push (10) | Keep remote (27) | Keep remote (27) |
| Only remote changed | Pull (9) | Keep local (26) | Keep local (26) | Pull (9) | Pull (9) |
| Local deleted, remote unchanged | Delete remote (4) | Nothing; remote stays (29) | Delete remote (38) | Pull remote back (35) | Pull remote back (35) |
| Remote deleted, local unchanged | Delete local (7) | Push local back (32) | Push local back (32) | Nothing; local stays (33) | Delete local (39) |
| Local deleted, remote also changed | Pull (5) | Nothing (30) | Nothing (30) | Pull (5) | Pull (5) |
| Remote deleted, local also changed | Push (8) | Push (8) | Push (8) | Nothing (34) | Nothing (34) |
| Both exist, and the file is not equal | `conflictAction` below | Keep local. Both created: 23. Both modified: 25 | Same as push | Keep remote. Both created: 22. Both modified: 24 | Same as pull |

Deleting local has one exception. The keys `{config dir}/` and `{config dir}/bookmarks.json` are not deleted. Bidirectional keeps local instead (branch 140). Pull-and-delete keeps local instead (branch 139). The config dir is usually `.obsidian`. Other synced config files are not in this exception.

Above the skip-large-files limit: a create on only one side does nothing (remote create 36, local create 37) and is not counted by modify protection. A modification of an already tracked file above that size throws while building the plan, and the sync stops. `skipSizeLargerThan <= 0` means size is not a reason to skip.

**`conflictAction` (bidirectional only, and only when both sides changed).** The setting text: a conflict is a file created or modified on both sides since the last sync. Branch 40 has already removed hash-equal files, so those files do not reach this step.

Time is `mtimeCli`, then `mtimeSvr`, then 0. On WebDAV both remote fields are `lastmod`, so this compares the local file mtime with the remote `lastmod`. Size compares `sizeEnc`. A tie keeps local (`>=`).

| `conflictAction` | Both created (no previous record) | Both modified (a previous record exists, and neither side matches it) |
| --- | --- | --- |
| `keep_newer` (default) | The newer mtime overwrites the other side. Branch 11 keeps local, 12 keeps remote | Same, by time. Branch 16 keeps local, 17 keeps remote |
| `keep_larger` | The larger `sizeEnc` wins. Branch 13 keeps local, 14 keeps remote | Same, by size. Branch 18 keeps local, 19 keeps remote |
| `smart_conflict` | See below. Branch 302 | See below. Branch 301 |

A path that starts with `{config dir}/` uses `keep_newer` even when `smart_conflict` is selected. It is not merged.

Smart Conflict does not need a PRO account in this fork. At execution (`pro/src/conflictLogic.ts`):

- `.md` or `.markdown`, and `sizeRaw` ≤ 1 MB (`MERGABLE_SIZE = 1000 * 1000`): diff3 merge. A saved content history makes it a three-way merge. Without that history, the longest common subsequence is treated as the old text and the merge is two-way. The result is written locally and remotely. If the bytes are already identical, that content is kept.
- Larger Markdown, or anything that is not Markdown: no merge. The local file is renamed to `name.dup.ext` and uploaded. The remote file is downloaded under the original name. When `sizeRaw` matches and the bytes match too, local metadata is rewritten from the remote and no duplicate is uploaded.

**`protectModifyPercentage` (default 50).** Checked in `doActualSync` after the plan exists and before the real push/pull. The denominator is the number of files in the plan: folders are excluded, the internal key `/$@meta` is excluded, and equal files and creates are included. The numerator is:

- Push/pull decisions whose name contains `modified` or `conflict`. That includes one-sided modifications (9, 10), bidirectional conflict choices (11–14, 16–19), one-way conflicts (22–27, plus 32 and 35, which push or pull the file back), and Smart Conflict (301, 302). Those one-way decisions count because the name contains `conflict`, even when one side simply overwrites the other. The bookmarks exception (139, 140) uses the same decision name `conflict_created_then_keep_local`, pushes that file back to the remote, and counts.
- Deletions whose name contains `deleted` and does not contain `folder`. Bidirectional 4 and 7, and one-way 38 and 39 when delete is enabled.

Not in the numerator:

- Equal: branches 2, 21, and 40. A vault-wide mtime rewrite whose hashes match lands here. That is why the new version does not trip modify protection for those files.
- A pure create push or pull (6, 3).
- `conflict_created_then_do_nothing` (one-way ignore of a create on the other side, such as 28 and 31). Those sit in the "mark already synced" group and are not counted.
- Folders, history-only (both already deleted, branch 1), and over-limit skips (36, 37).

Abort when the denominator is greater than 0 and `numerator * 100 >= denominator * percentage`. Setting 100 disables the protection (the case percentage 100 and numerator equal to the denominator is also allowed through). Setting 0 aborts whenever the denominator is greater than 0, including when the numerator is 0. The settings text matches this. An abort skips this run's push, pull, and delete. A WebDAV download that already happened while hashing during planning is not undone by the abort.

### Other differences

- **No PRO gate.** No Remotely Save account and no payment. Smart Conflict and the remotes that used to be marked PRO (OneDrive (Full), Google Drive, Box, pCloud, Yandex Disk, Koofr, Azure Blob Storage) are available in this fork. Each service still uses that service's own authorization.
- **Simplified Chinese UI.** Settings and messages are Simplified Chinese, with English when a string has no Chinese entry. Service names and technical terms stay in English.

Not implemented in this repo, and not described above as if they were: several WebDAV endpoints at once, a 123 Pan-specific protocol, recomputing pCloud's proprietary hash, and content-hash comparison while the encryption password is non-empty.

## Cautions

- **Back up the whole vault before use.** This is not Obsidian's official [Sync](https://obsidian.md/sync).
- **Cloud services can cost money.** Uploads, downloads, listings, API calls, and storage may all be billed.
- **Protect `data.json`.** It lives at `<vault>/.obsidian/plugins/remotely-save/data.json` and holds cloud credentials. Do not share it or commit it. The plugin tries to write a `.gitignore` in the plugin folder so git ignores that file.
- Obsidian Mobile is slow with files around 50 MB and larger. Use the skip-large-files setting if you need to.

## Install

This fork has **no GitHub Releases yet**. Build locally, or download a successful CI artifact. BRAT installs from a Release, so it cannot install this fork until one exists.

The plugin id is still `remotely-save`, in the same folder as upstream. Copying these files over an existing install replaces upstream in that vault. Updating the plugin from the community plugin list swaps in an upstream build; copy these three files again to stay on this fork.

| File | Where it comes from |
| --- | --- |
| `main.js` | `npm run build`, or a CI artifact. Not committed |
| `manifest.json` | repo root, or a CI artifact |
| `styles.css` | repo root, or a CI artifact |

Copy them to:

```text
<vault>/.obsidian/plugins/remotely-save/
```

Reload Obsidian, then enable Remotely Save under Settings → Community plugins. Turn off Restricted mode the first time you use community plugins.

### Build from source

CI uses Node.js 20. The install build script in `package.json` is `build` (webpack production). `dev` is watch mode for development.

```bash
git clone https://github.com/769469798/remotely-save.git
cd remotely-save
npm install
npm run build
```

`npm run build` writes `main.js` at the repo root. Copy `main.js`, `manifest.json`, and `styles.css` into the plugin folder above.

S3, WebDAV, Webdis, and Azure Blob Storage need no compile-time secrets. OAuth client ids for Dropbox, OneDrive, Google Drive, Box, pCloud, Yandex Disk, and Koofr are compiled into `main.js`. Set the same environment variables as [`.github/workflows/auto-build.yml`](./.github/workflows/auto-build.yml) before building if you use those services:

- `DROPBOX_APP_KEY`
- `ONEDRIVE_CLIENT_ID`, `ONEDRIVE_AUTHORITY`
- `GOOGLEDRIVE_CLIENT_ID`, `GOOGLEDRIVE_CLIENT_SECRET`
- `BOX_CLIENT_ID`, `BOX_CLIENT_SECRET`
- `PCLOUD_CLIENT_ID`, `PCLOUD_CLIENT_SECRET`
- `YANDEXDISK_CLIENT_ID`, `YANDEXDISK_CLIENT_SECRET`
- `KOOFR_CLIENT_ID`, `KOOFR_CLIENT_SECRET`

The build still succeeds without them. Those OAuth services then cannot authorize.

### CI artifacts

[BuildCI](https://github.com/769469798/remotely-save/actions/workflows/auto-build.yml) uploads an artifact named `my-dist` (`main.js`, `manifest.json`, `styles.css`) after a successful run. Download it from that run and copy the files as above.

The workflow uses the `env-for-buildci` environment and OAuth secrets. If there is no successful run, build locally. Every push starts a build, and those artifacts can be unstable.

### BRAT

With [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat), add this beta plugin repository:

```text
769469798/remotely-save
```

BRAT downloads `main.js`, `manifest.json`, and `styles.css` from a GitHub Release. This fork has no Release yet, so that step fails until one is published.

### Upstream community listing

[obsidian.md/plugins?id=remotely-save](https://obsidian.md/plugins?id=remotely-save) installs upstream [remotely-save/remotely-save](https://github.com/remotely-save/remotely-save). Its account, payment, and UI language differ from this fork.

## Remotes and notes

Supported remotes include Amazon S3 and S3-compatible storage, Dropbox, OneDrive (App Folder and Full), WebDAV, Webdis, Google Drive, Box, pCloud, Yandex Disk, Koofr, and Azure Blob Storage. Setup notes are under [`docs/remote_services/`](./docs/remote_services/). Connectivity notes: [docs/services_connectable_or_not.md](./docs/services_connectable_or_not.md).

Also: desktop and mobile, optional [end-to-end encryption](./docs/encryption/README.md), scheduled sync, sync on save, regex skip rules, and the [sync algorithm](./docs/sync_algorithm/v3/intro.md). With default settings, vault names should match across devices. Auto sync runs only while Obsidian is open, and errors in auto sync or sync-on-save fail silently. Names starting with `.` or `_` are skipped unless you enable those options.

License: Apache-2.0 for `src`, `tests`, `docs`, and `assets`; PolyForm Strict 1.0.0 for `pro`. See [LICENSE](./LICENSE).
