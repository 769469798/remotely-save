# Remotely Save（个人 fork）

[English](./README.en.md)

这是 [remotely-save/remotely-save](https://github.com/remotely-save/remotely-save)（作者 fyears）的个人 fork，仓库是 [769469798/remotely-save](https://github.com/769469798/remotely-save)。

Obsidian 社区插件列表里的 id `remotely-save` 安装的是**上游**插件。安装本 fork 请按下面的「安装」一节操作。

## 本 fork 的行为

- **不需要 Remotely Save 账号，也不需要 PRO 付费。** Smart Conflict 以及原先的 PRO 远程服务已解锁：OneDrive (Full)、Google Drive、Box、pCloud、Yandex Disk、Koofr、Azure Blob Storage。每个服务仍使用该服务自己的授权。
- **界面为简体中文。** 设置和提示使用简体中文；某条文案没有中文时回退英文。服务名和技术术语保持英文，例如 WebDAV、S3、Dropbox、OneDrive、Google Drive、mtime、hash、CORS。
- **content hash 相同则视为未修改。** 整库复制、解压或网盘客户端回写时，文件字节不变，mtime 却常被改掉。两边的 content hash 都存在且相等时，同步计划仍记为 equal（分支 40），不计入修改比例保护。细节见 [content hash recheck](./docs/sync_algorithm/content_hash_recheck.md)。密码非空的端到端加密不走这条比较。

## 警告

- **使用前备份整个 vault。** 本插件不是 Obsidian 官方 [Sync](https://obsidian.md/sync)。
- **云服务可能收费。** 上传、下载、列目录、API 调用和存储都可能产生费用。
- **保护 `data.json`。** 路径是 `<vault>/.obsidian/plugins/remotely-save/data.json`，里面有云端凭据。不要把这个文件发给别人，也不要提交到 git。插件会在插件目录尝试写入 `.gitignore` 来忽略它。
- Obsidian 移动端同步大约 50 MB 及以上的文件时性能较差。可在设置里跳过大文件。

## 安装

本 fork **目前没有 GitHub Releases**。今天能用的办法是本地构建，或在 Actions 里下载成功的 CI 产物。BRAT 要从 Release 拉文件，在本仓库打出 Release 之前装不上。

插件 id 仍是 `remotely-save`，目录与上游相同。把文件放进已有目录会替换该库里的上游副本。之后若在社区插件页面对本插件执行更新，会换成上游构建；要继续用本 fork，请再次覆盖下面三个文件。

需要的文件：

| 文件 | 来源 |
| --- | --- |
| `main.js` | `npm run build` 或 CI 产物。仓库不提交此文件 |
| `manifest.json` | 仓库根目录，或 CI 产物 |
| `styles.css` | 仓库根目录，或 CI 产物 |

放到：

```text
<vault>/.obsidian/plugins/remotely-save/
```

Obsidian 若已打开，重新加载后再到「设置 → 第三方插件」启用 Remotely Save。首次使用第三方插件时，先关闭受限模式。

### 从源码构建

CI 使用 Node.js 20。`package.json` 里的安装用构建脚本是 `build`（webpack production）。`dev` 是监视模式，用来开发，不用于安装。

```bash
git clone https://github.com/769469798/remotely-save.git
cd remotely-save
npm install
npm run build
```

`npm run build` 在仓库根目录写出 `main.js`。把 `main.js`、`manifest.json`、`styles.css` 复制到上面的插件目录。

S3、WebDAV、Webdis、Azure Blob Storage 不需要编译期密钥。Dropbox、OneDrive、Google Drive、Box、pCloud、Yandex Disk、Koofr 的 OAuth client 在构建时写入 `main.js`。要使用这些服务，构建前设置与 [`.github/workflows/auto-build.yml`](./.github/workflows/auto-build.yml) 相同的环境变量：

- `DROPBOX_APP_KEY`
- `ONEDRIVE_CLIENT_ID`、`ONEDRIVE_AUTHORITY`
- `GOOGLEDRIVE_CLIENT_ID`、`GOOGLEDRIVE_CLIENT_SECRET`
- `BOX_CLIENT_ID`、`BOX_CLIENT_SECRET`
- `PCLOUD_CLIENT_ID`、`PCLOUD_CLIENT_SECRET`
- `YANDEXDISK_CLIENT_ID`、`YANDEXDISK_CLIENT_SECRET`
- `KOOFR_CLIENT_ID`、`KOOFR_CLIENT_SECRET`

未设置这些变量时，`npm run build` 仍会成功，对应的 OAuth 服务无法完成授权。

### CI 产物

工作流 [BuildCI](https://github.com/769469798/remotely-save/actions/workflows/auto-build.yml) 在一次运行成功后，上传名为 `my-dist` 的 artifact，内含 `main.js`、`manifest.json`、`styles.css`。在该次运行页面下载 artifact，再按上一节复制到插件目录。

该工作流使用 environment `env-for-buildci`，并读取仓库 Secrets 里的 OAuth client。没有成功运行时，改用本地构建。每次推送都会触发构建，产物可能不稳定。

### BRAT

安装 [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat) 后，添加 beta 插件，仓库填写：

```text
769469798/remotely-save
```

BRAT 从 GitHub Release 下载 `main.js`、`manifest.json`、`styles.css`。本 fork 目前没有 Release，这一步现在会失败。仓库出现 Release 之后再用。

### 上游社区插件

社区插件页 [obsidian.md/plugins?id=remotely-save](https://obsidian.md/plugins?id=remotely-save) 安装的是上游 [remotely-save/remotely-save](https://github.com/remotely-save/remotely-save)。上游的账号、付费和界面语言与本 fork 不同。

## 远程服务

- Amazon S3 及 S3 兼容服务（Cloudflare R2、Backblaze B2、MinIO、腾讯云 COS、又拍云等）。教程在 [`docs/remote_services/`](./docs/remote_services/)
- Dropbox
- OneDrive 个人版（App Folder，以及 Full / 根目录）
- WebDAV（Nextcloud、坚果云、群晖、AList 等）
- Webdis（实验性，需自行保护服务器）
- Google Drive、Box、pCloud、Yandex Disk、Koofr、Azure Blob Storage

更多服务能否连接：[docs/services_connectable_or_not.md](./docs/services_connectable_or_not.md)。

另外支持 Obsidian 桌面与移动端、可选的[端到端加密](./docs/encryption/README.md)（openssl / rclone crypt）、定时同步、保存时同步、用正则跳过大文件或路径，以及[最小侵入设计](./docs/minimal_intrusive_design.md)。同步算法说明：[v3 intro](./docs/sync_algorithm/v3/intro.md)。

## 使用时注意

- 默认设置下，多台设备的 vault 名称应相同。S3 未设置 prefix 时，bucket 只放一个 vault；设置 prefix 后，同一个 bucket 可以放多个 vault。
- 端到端加密的密码由你保管。vault 名称本身不加密。不设密码时按原文同步。
- 定时同步和保存时同步出错会静默失败。Obsidian 未打开时不会自动同步。
- 以 `.` 或 `_` 开头的文件和文件夹默认不同步，因此主题、其他插件和本插件设置默认也不会同步。可在设置中打开 `_` 以及 `.obsidian`（实验性；部分配置文件每次打开 Obsidian 都会改 mtime）。书签文件是 `.obsidian/bookmarks.json`，可以单独同步。
- 冲突时可以保留较新文件、保留较大文件，或使用 Smart Conflict（合并较小的 Markdown，或复制较大的 Markdown 以及非 Markdown 文件）。
- 排错：[docs/how_to_debug/README.md](./docs/how_to_debug/README.md)。非 OAuth 设置可以用二维码导入导出：[docs/import_export_some_settings.md](./docs/import_export_some_settings.md)。

## 许可

`src`、`tests`、`docs`、`assets` 为 Apache-2.0。`pro` 为 PolyForm Strict 1.0.0。见 [LICENSE](./LICENSE)。
