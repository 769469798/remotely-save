# Content hash recheck

Bulk vault pulls (Dropbox client, a zip import, copying the vault) often rewrite file mtime while leaving the bytes unchanged. Sync v3 treats "both exist, but mtime or size disagree" as a modification. If that happens to most of the vault, `protectModifyPercentage` aborts the sync. A vault of about 154 files can show roughly 152 of them as modified (about 98.7%) and get blocked even though nothing in the notes changed.

## Rule

The fast path is unchanged. Branch **2** is still "equal" when client mtime matches `mtimeCli` or `mtimeSvr` and `sizeEnc` matches.

If that check fails and **both** content hashes are present and equal, the plan is still **equal** with `change = false`. That is branch **40**. Branch 40 is not a modify or a delete, so it is not counted by modify-protection.

A missing hash is not a match. Two different hashes are not a match. mtime+size equality still wins when it succeeds, even if a hash is absent.

## When bytes are read

Hashes are not computed for every file on every sync.

- Encryption (non-empty password): no reads and no hash equality. See below.
- mtime+size already equal: no read.
- Both hashes already present (provider listing or cache): compare them, no read.
- Sizes differ: no read. Different lengths are not the same content.
- Otherwise, and only then, read the side that is missing a hash.

The previous successful sync record is a cache. If its hash is set and this side's mtime and `sizeEnc` still match that record, the hash is copied and the file is not read. After branch 40 runs for real (not a dry run), the record is updated with the matched hash and the current mtimes so the next everyday sync can take this path.

## Which hash

| Service | `Entity.hash` | Recheck |
| --- | --- | --- |
| Dropbox | content hash (SHA-256 of 4 MiB block hashes) | hash local bytes with the same algorithm; remote hash comes from the listing |
| Box | SHA-1 hex | SHA-1 |
| Yandex Disk | SHA-256 hex | SHA-256 |
| Google Drive, Koofr, Azure Blob | MD5 hex | MD5. Koofr's samples are 32 hex digits. If a Koofr hash is not MD5, it will not match and the file stays on the mtime+size path |
| S3, WebDAV, OneDrive, OneDrive (full), Webdis | none | SHA-1 of **both** sides, which can download the remote file |
| pCloud | proprietary numeric hash | not recomputed. Equal only when both sides already have the same hash string |

Hex hashes compare case-insensitively. An empty hash is ignored.

## Encryption

`FakeFsEncrypt` clears `hash` on purpose: a provider hash is of ciphertext, not of the note in the vault. While `password` is non-empty the recheck does nothing. It does not hash plaintext, does not hash ciphertext, and does not store a made-up hash on the previous-sync record. Files continue to compare by mtime and encrypted size only. Turning encryption off later cannot trip over a hash this feature invented, because it never wrote one.

## See also

The same rules, including which service uses which hash and the WebDAV SHA-1 download, are written up next to the WebDAV direction and conflict rules:

- [README.md（简体中文）](../../README.md#upstream-diff)
- [README.en.md](../../README.en.md#upstream-diff)
