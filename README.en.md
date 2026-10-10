# Remotely Save (personal fork)

[简体中文](./README.md)

Personal fork of [remotely-save/remotely-save](https://github.com/remotely-save/remotely-save) (by fyears): [769469798/remotely-save](https://github.com/769469798/remotely-save).

Changes land on **this fork's** `master` only. **No** PRs are opened against upstream. The Obsidian community plugin id `remotely-save` installs the **upstream** build—do not mix it with this fork.

Current version: `0.5.25` ([Release v0.5.25](https://github.com/769469798/remotely-save/releases/tag/v0.5.25)).

<a id="upstream-diff"></a>

## Differences from upstream

| | Upstream | This fork |
| --- | --- | --- |
| Repo | [remotely-save/remotely-save](https://github.com/remotely-save/remotely-save) | [769469798/remotely-save](https://github.com/769469798/remotely-save) |
| Install | Community plugin store | BRAT / Release trio / build from source |
| PRO | Account + paywall for some remotes and Smart Conflict | **Removed.** No Remotely Save account or PRO payment. Smart Conflict and former PRO remotes (OneDrive (Full), Google Drive, Box, pCloud, Yandex Disk, Koofr, Azure Blob Storage) are available. Each cloud still uses its own OAuth/credentials |
| UI | Multi-language | **Simplified Chinese** (English fallback). Service names and technical terms stay in English |
| Equality | Mostly mtime + `sizeEnc` (branch 2) | Also **equal when both content hashes match** (branch 40), so bulk copy/unzip/cloud clients that rewrite mtime without changing bytes are less likely to trip modify protection. See [content hash recheck](./docs/sync_algorithm/content_hash_recheck.md) |

Notes: non-empty end-to-end encryption password skips content-hash recheck. Sync algorithm remains v3 ([design](./docs/sync_algorithm/v3/design.md)). Not implemented here: multiple WebDAV endpoints at once, a 123 Pan-specific client, recomputing pCloud's proprietary hash, or hash compare while encryption is on.

## Install

Plugin id is still `remotely-save`. Overwriting replaces whatever was in that vault folder. Updating from the **community store** swaps back to upstream.

Copy these three files into:

```text
<vault>/.obsidian/plugins/remotely-save/
```

| File | Source |
| --- | --- |
| `main.js` | Release / CI artifact / `npm run build` |
| `manifest.json` | repo root or Release / CI |
| `styles.css` | repo root or Release / CI |

Reload Obsidian and enable the plugin (turn off Restricted mode if needed).

### BRAT (recommended)

Install [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat), then add:

```text
769469798/remotely-save
```

BRAT pulls `main.js`, `manifest.json`, and `styles.css` from this repo's GitHub Release (currently [v0.5.25](https://github.com/769469798/remotely-save/releases/tag/v0.5.25)).

### Release trio

Download the three files from [Releases](https://github.com/769469798/remotely-save/releases) into the plugin folder.

### Build from source

```bash
git clone https://github.com/769469798/remotely-save.git
cd remotely-save
npm install
npm run build
```

Uses webpack production (`npm run build`); Node.js 20 in CI. Or download the `my-dist` artifact from [BuildCI](https://github.com/769469798/remotely-save/actions/workflows/auto-build.yml) (`workflow_dispatch` supported).

OAuth client ids for Dropbox / OneDrive / Google Drive / Box / pCloud / Yandex Disk / Koofr are baked into `main.js` at build time—see env vars in [`.github/workflows/auto-build.yml`](./.github/workflows/auto-build.yml). Official CI/Release builds usually include them.

**Do not** install this fork from [obsidian.md/plugins?id=remotely-save](https://obsidian.md/plugins?id=remotely-save)—that is upstream.

## Remotes (short)

S3-compatible storage, Dropbox, OneDrive (App Folder / Full), WebDAV, Webdis, Google Drive, Box, pCloud, Yandex Disk, Koofr, Azure Blob Storage. Setup notes under [`docs/remote_services/`](./docs/remote_services/). Optional [E2E encryption](./docs/encryption/README.md), scheduled sync, sync-on-save, skip regexes. Algorithm intro: [v3 intro](./docs/sync_algorithm/v3/intro.md).

## Cautions

- **Back up the whole vault** before use. Not official Obsidian [Sync](https://obsidian.md/sync).
- **Cloud usage can cost money** (API, transfer, storage).
- **Protect `data.json`** at `<vault>/.obsidian/plugins/remotely-save/data.json` (credentials). Do not share or commit it.
- Auto sync only while Obsidian is open; some auto failures are silent.
- Mobile is slow with files around 50 MB+; use skip-large-files if needed.
- Debug: [docs/how_to_debug/README.md](./docs/how_to_debug/README.md).

## License & disclaimer

Apache-2.0 for `src`, `tests`, `docs`, `assets`; PolyForm Strict 1.0.0 for `pro`. See [LICENSE](./LICENSE).

Provided as-is. No warranty for data loss, conflicts, cloud bills, or third-party API changes. Back up first.
