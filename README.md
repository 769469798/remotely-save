# Remotely Save（个人 fork）

[English](./README.en.md)

这是 [remotely-save/remotely-save](https://github.com/remotely-save/remotely-save)（作者 fyears）的**个人 fork**，仓库：[769469798/remotely-save](https://github.com/769469798/remotely-save)。

本仓库的改动只合进本 fork 的 `master`，**不会**向上游开 PR。Obsidian 社区插件商店里 id 为 `remotely-save` 的条目安装的是**上游**构建，不要与本 fork 混用。

当前版本：`0.5.25`（见 [Release v0.5.25](https://github.com/769469798/remotely-save/releases/tag/v0.5.25)）。

<a id="upstream-diff"></a>

## 本 fork 与上游的差异

| 项目 | 上游 | 本 fork |
| --- | --- | --- |
| 仓库 | [remotely-save/remotely-save](https://github.com/remotely-save/remotely-save) | [769469798/remotely-save](https://github.com/769469798/remotely-save) |
| 安装渠道 | Obsidian 社区插件商店 | BRAT / Release 三件套 / 源码构建（见下） |
| PRO | 账号与付费门槛；部分远程与 Smart Conflict 需 PRO | **已去掉** Remotely Save 账号与 PRO 付费；Smart Conflict 以及原 PRO 远程（OneDrive (Full)、Google Drive、Box、pCloud、Yandex Disk、Koofr、Azure Blob Storage）可直接用。各云服务仍用该服务自己的授权 |
| 界面语言 | 多语言可选 | **简体中文**为主；缺中文文案时回退英文。服务名、技术词、产品名保留英文（如 WebDAV、S3、Dropbox、mtime、hash） |
| 内容相等判定 | 主要靠 mtime + `sizeEnc`（分支 2） | 另增加：**两边 content hash 都在且相等**时仍记为 equal（分支 40），整库复制/解压/网盘回写导致 mtime 被改、字节未变时不易误判为大量修改。细节见 [content hash recheck](./docs/sync_algorithm/content_hash_recheck.md) |

说明：

- 端到端加密密码**非空**时不做 content hash 复检（服务端哈希描述密文，不是库内笔记）。
- 同步算法仍为 v3；推拉、冲突、`protectModifyPercentage` 等行为见 [v3 design](./docs/sync_algorithm/v3/design.md)。
- 本仓库**未实现**：多套 WebDAV 同时同步、123 盘专用协议、pCloud 专有哈希重算、加密开启时的内容哈希比较。

## 安装

插件 id 仍是 `remotely-save`，目录与上游相同。覆盖安装会替换该 vault 里已有的插件；若之后从**社区商店**更新，会换回上游构建，需再装回本 fork。

需要放入插件目录的三个文件：

| 文件 | 来源 |
| --- | --- |
| `main.js` | Release / CI artifact / `npm run build`（仓库不提交此文件） |
| `manifest.json` | 仓库根目录或 Release / CI |
| `styles.css` | 仓库根目录或 Release / CI |

目标路径：

```text
<vault>/.obsidian/plugins/remotely-save/
```

装好后在 Obsidian 中重新加载，于「设置 → 社区插件」启用 Remotely Save（首次使用社区插件时请关闭受限模式）。

### 方式一：BRAT（推荐）

1. 安装 [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. 添加 Beta 插件仓库：

```text
769469798/remotely-save
```

BRAT 会从本仓库的 GitHub Release（当前为 [v0.5.25](https://github.com/769469798/remotely-save/releases/tag/v0.5.25)）拉取 `main.js`、`manifest.json`、`styles.css`。

### 方式二：Release 三件套

从 [Releases](https://github.com/769469798/remotely-save/releases) 下载最新版（如 v0.5.25）中的 `main.js`、`manifest.json`、`styles.css`，放到上面的插件目录。

### 方式三：源码构建

```bash
git clone https://github.com/769469798/remotely-save.git
cd remotely-save
npm install
npm run build
```

`npm run build`（webpack production）在仓库根目录生成 `main.js`，再与 `manifest.json`、`styles.css` 一起复制到插件目录。开发可用 `npm run dev`（watch）。CI 使用 Node.js 20。

也可从 [BuildCI](https://github.com/769469798/remotely-save/actions/workflows/auto-build.yml) 成功运行的 artifact（名 `my-dist`）下载三件套。工作流支持 `workflow_dispatch`。

**OAuth 编译期密钥：** S3、WebDAV、Webdis、Azure Blob Storage 一般不需要。Dropbox、OneDrive、Google Drive、Box、pCloud、Yandex Disk、Koofr 的 OAuth client 会编进 `main.js`。本地构建若要用这些服务，请按 [`.github/workflows/auto-build.yml`](./.github/workflows/auto-build.yml) 设置对应环境变量；未设置时构建仍可能成功，但相关 OAuth 无法完成授权。官方 CI / Release 产物通常已带齐可用密钥。

### 不要用社区商店装本 fork

[obsidian.md/plugins?id=remotely-save](https://obsidian.md/plugins?id=remotely-save) 指向上游，账号/付费/语言/哈希行为与本 fork 不同。

## 远程服务与功能概要

支持（与上游能力大致相当，本 fork 无 PRO 门槛）：

- Amazon S3 及兼容存储（Cloudflare R2、Backblaze B2、MinIO、腾讯云 COS、又拍云等），说明见 [`docs/remote_services/`](./docs/remote_services/)
- Dropbox、OneDrive（App Folder / Full）、WebDAV（坚果云、群晖、AList 等）、Webdis
- Google Drive、Box、pCloud、Yandex Disk、Koofr、Azure Blob Storage

连通性参考：[docs/services_connectable_or_not.md](./docs/services_connectable_or_not.md)。

另支持桌面与移动端、可选[端到端加密](./docs/encryption/README.md)（openssl / rclone crypt）、定时同步、保存时同步、路径正则跳过、[同步算法说明](./docs/sync_algorithm/v3/intro.md)。

## 同步与使用注意

- **使用前务必备份整个 vault。** 本插件不是 Obsidian 官方 [Sync](https://obsidian.md/sync)。
- **云费用：** 上传、下载、列目录、API 调用与存储都可能产生费用，请自行关注账单。
- **保护 `data.json`：** 路径为 `<vault>/.obsidian/plugins/remotely-save/data.json`，内含云端凭证。不要分享、不要提交到 git。插件会尽量在插件目录写入 `.gitignore` 忽略该文件。
- 默认设置下，多台设备的 vault 名称宜一致；S3 未设 prefix 时，一个 bucket 通常只放一个 vault。
- 端到端加密开启后请妥善保管密码；忘记则无法还原已加密内容。
- 定时同步与保存时同步在失败时可能静默；Obsidian 未打开时不会自动同步。
- 以 `.` 或 `_` 开头的路径默认不同步（可在设置中放宽）；部分配置文件每次打开 Obsidian 都会改 mtime，可按需单独处理。
- 冲突时可保留较新/较大文件，或使用 Smart Conflict（小 Markdown 可合并；其余可能生成本地 `.dup.` 副本）。
- 移动端对约 50 MB 及以上大文件较慢，可用「跳过过大文件」类选项。
- 排错：[docs/how_to_debug/README.md](./docs/how_to_debug/README.md)。部分 OAuth 设置可用二维码导入导出：[docs/import_export_some_settings.md](./docs/import_export_some_settings.md)。

## 开发

- 格式化：`npm run format`（Biome）
- 测试：`npm run test`
- 清理：`npm run clean`（删除 `main.js`）

欢迎对本 fork 提 Issue / PR；目标分支为 **本仓库** `master`，请勿默认当作向上游贡献。

## 许可证

`src`、`tests`、`docs`、`assets` 为 Apache-2.0；`pro` 为 PolyForm Strict 1.0.0。详见 [LICENSE](./LICENSE)。

## 免责声明

本软件按「现状」提供，作者与维护者不对数据丢失、同步冲突、云服务费用或第三方服务变更承担责任。请自行备份，并在充分了解风险后再使用。
