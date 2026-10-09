# Remotely Save (personal fork)

[简体中文](./README.md)

This repository, [769469798/remotely-save](https://github.com/769469798/remotely-save), is a personal fork of [remotely-save/remotely-save](https://github.com/remotely-save/remotely-save) by fyears.

The Obsidian community plugin id `remotely-save` installs the **upstream** plugin. Use the steps below for this fork.

## What this fork changes

- **No Remotely Save account and no PRO payment.** Smart Conflict and the former PRO remotes are unlocked: OneDrive (Full), Google Drive, Box, pCloud, Yandex Disk, Koofr, and Azure Blob Storage. Each service still uses that service's own authorization.
- **Simplified Chinese UI.** Settings and messages are Simplified Chinese, with English when a string has no Chinese entry. Service names and technical terms stay in English (WebDAV, S3, Dropbox, mtime, hash, and so on).
- **Equal content hashes mean equal files.** Copying a vault, unzipping it, or a cloud client often rewrites mtime and leaves the bytes unchanged. When both content hashes are present and equal, the sync plan stays equal (branch 40) and is not counted by modify protection. See [content hash recheck](./docs/sync_algorithm/content_hash_recheck.md). End-to-end encryption (non-empty password) does not use this comparison.

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
