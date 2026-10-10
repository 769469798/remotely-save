# Remotely Save（个人 fork）

[English](./README.en.md)

这是 [remotely-save/remotely-save](https://github.com/remotely-save/remotely-save)（作者 fyears）的个人 fork，仓库是 [769469798/remotely-save](https://github.com/769469798/remotely-save)。

Obsidian 社区插件列表里的 id `remotely-save` 安装的是**上游**插件。安装本 fork 请按下面的「安装」一节操作。

## 本 fork 的行为

- **不需要 Remotely Save 账号，也不需要 PRO 付费。** Smart Conflict 以及原先的 PRO 远程服务已解锁：OneDrive (Full)、Google Drive、Box、pCloud、Yandex Disk、Koofr、Azure Blob Storage。每个服务仍使用该服务自己的授权。
- **界面为简体中文。** 设置和提示使用简体中文；某条文案没有中文时回退英文。服务名和技术术语保持英文，例如 WebDAV、S3、Dropbox、OneDrive、Google Drive、mtime、hash、CORS。
- **content hash 相同则视为未修改。** 整库复制、解压或网盘客户端回写时，文件字节不变，mtime 却常被改掉。两边的 content hash 都存在且相等时，同步计划仍记为 equal（分支 40），不计入修改比例保护。细节见 [content hash recheck](./docs/sync_algorithm/content_hash_recheck.md)。密码非空的端到端加密不走这条比较。与上游的逐项对比见[与上游的行为差异](#upstream-diff)。

<a id="upstream-diff"></a>

## 与上游的行为差异

| | 老版本（上游） | 新版本（本 fork） |
| --- | --- | --- |
| 仓库 | [remotely-save/remotely-save](https://github.com/remotely-save/remotely-save)。Obsidian 社区插件 id `remotely-save` 安装的是这一份。 | [769469798/remotely-save](https://github.com/769469798/remotely-save)。 |
| 双方都在时，怎样算 equal | 只看 mtime + `sizeEnc`。对上才是分支 2。本仓库文档把这称为加入 content hash recheck 之前的计划。 | mtime + `sizeEnc` 仍然优先（分支 2）。对不上时，若两边 content hash 都在且相等，仍是 equal（分支 40）。 |
| 整库拉取 / 解压改写 mtime | 字节没变也会离开 equal，大量文件进入修改或冲突，计入 `protectModifyPercentage`，默认 50% 时常被中止。 | 哈希对上的文件留在 equal，不计入修改保护。 |
| 依据 | [content hash recheck](./docs/sync_algorithm/content_hash_recheck.md) 里对旧路径的描述，以及 [v3 design](./docs/sync_algorithm/v3/design.md) 的分支表。 | 当前源码：`src/contentHash.ts`，`pro/src/sync.ts` 的 `getSyncPlanInplace`，以及上面两份文档。 |

推拉和冲突仍是同步算法 v3。WebDAV 没有第二套计划。选中的远程是 WebDAV 时，下面第二节就是它的双向规则。

### 哈希验证（content hash recheck）

规则全文：[docs/sync_algorithm/content_hash_recheck.md](./docs/sync_algorithm/content_hash_recheck.md)。分支号对照：[docs/sync_algorithm/v3/design.md](./docs/sync_algorithm/v3/design.md)。

**老版本。** 双方文件都在时，客户端 mtime 等于远端的 `mtimeCli` 或 `mtimeSvr`，并且 `sizeEnc` 相同，才记为 equal（分支 2）。整库拉取、解压、复制 vault，或网盘客户端回写，经常只改 mtime、不改字节。mtime 对不上之后，相对上次成功同步，计划变成单边修改（推或拉）或冲突。这些决定计入 `protectModifyPercentage`。文档里的例子：大约 154 个文件里大约 152 个被判成修改（约 98.7%），默认保护会中止同步，笔记字节并没有变。

**新版本。** 快路径不变。mtime + `sizeEnc` 对上就是分支 2，`change = false`，此时即使没有 hash 也不再读文件。对不上，且加密密码为空，且两边 content hash 都存在并相等，计划仍是 equal，`change = false`。这是分支 40。分支 40 不是修改，也不是删除，修改保护不数它。

下面三条都不会变成分支 40：

- 任一边没有 hash（空字符串也算没有）。
- 两边 hash 不相等。十六进制比较不区分大小写；不是十六进制则按原样比较，区分大小写。
- `sizeEnc` 已经不同。长度不同就不再计算哈希。双方都没有 `sizeEnc` 时，改比 `size`；大小对不上同样不读盘。

**什么时候读盘。** 不是每次同步、每个文件都算哈希。`fillMissingContentHashesInplace` 的顺序是：

1. 加密密码非空：整段复检返回，不读、不比较。`FakeFsEncrypt` 在密码非空时把 `hash` 写成 `undefined`，因为服务端哈希描述的是密文，不是库里的笔记。复检不哈希明文，不哈希密文，也不把编出来的哈希写进上次同步记录。之后关掉加密，不会撞上本功能写过的哈希。
2. mtime + `sizeEnc` 已经相同：跳过。
3. 两边哈希都已经有（列表带来的，或从上次同步记录抄来的）：只比较，不读。已经相等则跳过；都有但不相等，也跳过，留给后面的修改/冲突判断。
4. 大小不同：跳过。
5. 其余情况才读取还缺哈希的那一侧。pCloud 的种类是 `unsupported`，到了这一步也不读、不算。上次成功同步可以当缓存：该侧 mtime 与 `sizeEnc` 仍和记录一致，且记录里有哈希，就把哈希抄过来，不读文件。本地缓存看 `mtimeCli`。远端缓存看记录里的 `mtimeSvr` 是否等于这一侧的 `mtimeSvr` 或 `mtimeCli`。

分支 40 把对上的哈希和当前 mtime 写回上次同步记录，只发生在真正执行同步时。dry run 会做计划（因此也可能为了算哈希去下载），但 `triggerSource === "dry"` 时不跑 `doActualSync`，不写这条记录。下一次日常同步要能免读盘，需要有一次非 dry run 的成功同步。

**各远端用哪种哈希。** `contentHashKindForService`：

| 服务 | 列表里的 `Entity.hash` | 缺哈希时本插件怎么算 |
| --- | --- | --- |
| Dropbox | content hash：每 4 MiB 一块 SHA-256，再把这些块哈希拼起来做 SHA-256 | 本地用同一算法。远端哈希来自列表，复检不必再下载远端 |
| Box | SHA-1 十六进制（`sha1`） | SHA-1 |
| Yandex Disk | SHA-256 十六进制（`sha256`） | SHA-256 |
| Google Drive | MD5 十六进制（`md5Checksum`） | MD5 |
| Koofr | 列表里的 `hash`。文档记录的样本是 32 位十六进制，按 MD5 算 | MD5。若某次不是 MD5，对不上，文件留在 mtime+size 路径 |
| Azure Blob | `contentMD5` 转成十六进制 | MD5 |
| pCloud | 把专有数字 `hash` 变成字符串 | 不重新计算（种类是 `unsupported`）。只有两边已经带着同一段字符串时才算相等 |
| S3、WebDAV、OneDrive、OneDrive (Full)、Webdis | 无。S3 会保存 `etag`，复检不读 `etag`。OneDrive 源码里哈希仍是 TODO | 双方 SHA-1。缺的那一侧要读内容；缺远端时会下载远端文件 |

**WebDAV 哈希路径的成本。** `fromWebdavItemToEntity` 只记下 `lastmod` 和大小，不写 `hash`。WebDAV 的复检种类是 SHA-1。mtime+size 失败、大小相同、密码为空、上次记录又补不出两边哈希时，做计划会读本地文件，并用 `readRemote`（`fsEncrypt.readFile`）下载远端再算 SHA-1。下载发生在上传、拉取和删除之前，一个文件接一个文件 `await`，不使用设置里的并行度。dry run 做计划时也会下载。

第一次遇到整库 mtime 被改写、上次记录里又没有哈希时，这些大小没变的文件可能都被下载一遍。两边 SHA-1 相同则记为分支 40，不进入修改比例。真正同步成功之后，记录里有哈希和当时的 mtime；之后只要这一侧的 mtime 和 `sizeEnc` 仍与记录一致，就复用哈希，不再读、不再下载。

123 盘等只有 WebDAV、列表不带 content hash 的网盘，走的就是这条路径。本仓库没有 123 盘专用客户端。建议：

- 要用这条复检，端到端加密密码留空。密码非空时 WebDAV 也只比 mtime 和加密后的大小。
- 接受第一次（以及缓存失效时）的额外下载。缓存失效包括：该侧 mtime 或 `sizeEnc` 和上次记录对不上。若某个 WebDAV 每次列目录都改写 `lastmod`，下载会重复。本仓库没有为这种服务器做特例。
- 希望复检时少下载远端，用列表自带哈希的服务：Dropbox、Box、Yandex Disk、Google Drive、Koofr、Azure Blob。那些远端哈希来自列表，缺的通常只是本地。

### WebDAV 双向同步

同一套计划：`getSyncPlanInplace`，默认 `syncDirection` 为 `bidirectional`，默认 `conflictAction` 为 `keep_newer`。界面把同步方向标成实验性质。方向表原文在 [v3 design](./docs/sync_algorithm/v3/design.md)。

**一个 remote。** 设置里是一个「选择远程服务」下拉框（`serviceType`）。WebDAV 只有一份配置：地址、用户名、密码、`remoteBaseDir`。同步使用当前选中的那一个服务。多套 WebDAV 端点同时配置、同时同步：未实现。多台设备的用法是每台安装本插件，填写同一个 WebDAV，用双向同步经过这一份远端。插件不把设备 A 直接连到设备 B。

**什么叫没变。** 文件夹不看 mtime、大小或哈希，只看在不在。文件先做上一节的 equal 判断（分支 2、40，以及两边都和上次记录对得上时的分支 21）。equal 在所有方向上都是什么都不做，`change = false`。

离开 equal 之后，和上次成功同步记录比：

- 本地未改：`prevSync.mtimeCli === local.mtimeCli` 且 `sizeEnc` 相同。
- 远端未改：`prevSync.mtimeSvr` 等于远端的 `mtimeCli` 或 `mtimeSvr`，且 `sizeEnc` 相同。
- 没有上次记录时，只出现在一边算新建；两边都在但对不上，算双方新建，不是双方修改。

WebDAV 列表把 `lastmod` 同时写入远端的 `mtimeCli` 和 `mtimeSvr`（源码注明没有通用办法单独设置 WebDAV 的客户端 mtime）。密码为空时，`sizeEnc` 等于列表里的 `sizeRaw`。

下表里，「保留本地」会把本地文件写到远端；「保留远端」会把远端文件写到本地。`conflictAction` 只在双向、且最后一行时使用。单向方向不看这个选项。

| 情况 | 双向 `bidirectional` | 增量推送 | 增量推送带删除 | 增量拉取 | 增量拉取带删除 |
| --- | --- | --- | --- | --- | --- |
| 只有本地新建 | 推（6） | 推（6） | 推（6） | 不动（31） | 不动（31） |
| 只有远端新建 | 拉（3） | 不动（28） | 不动（28） | 拉（3） | 拉（3） |
| 仅本地改了 | 推（10） | 推（10） | 推（10） | 保留远端（27） | 保留远端（27） |
| 仅远端改了 | 拉（9） | 保留本地（26） | 保留本地（26） | 拉（9） | 拉（9） |
| 本地已删，远端未改 | 删远端（4） | 不动，远端留着（29） | 删远端（38） | 把远端拉回本地（35） | 把远端拉回本地（35） |
| 远端已删，本地未改 | 删本地（7） | 把本地推回远端（32） | 把本地推回远端（32） | 不动，本地留着（33） | 删本地（39） |
| 本地已删，远端又改了 | 拉（5） | 不动（30） | 不动（30） | 拉（5） | 拉（5） |
| 远端已删，本地又改了 | 推（8） | 推（8） | 推（8） | 不动（34） | 不动（34） |
| 两边都在，且不是 equal | 按下面的 `conflictAction` | 保留本地。双方新建 23，双方修改 25 | 同左 | 保留远端。双方新建 22，双方修改 24 | 同左 |

删本地有一个例外：键正好是 `{配置目录}/` 或 `{配置目录}/bookmarks.json` 时不删。双向改为保留本地（分支 140），增量拉取带删除改为保留本地（分支 139）。配置目录一般是 `.obsidian`。其它已同步的配置文件不在这个例外里。

体积超过「跳过大文件」时：仅一侧新建则什么都不做（远端新建 36，本地新建 37），不计入修改保护。已经跟踪的文件若被修改且超过该体积，做计划时抛错，这次同步停住。`skipSizeLargerThan <= 0` 表示不按体积跳过。

**`conflictAction`（仅双向，且两边都变了）。** 设置说明：自上次同步以来，文件在本地和远端都被创建或修改，才是冲突。比较之前，分支 40 已经把哈希相同的文件拿走了，那些文件不会进这里。

时间取 `mtimeCli`，没有则 `mtimeSvr`，再没有则 0。WebDAV 远端这两个字段都是 `lastmod`，所以比的是本地文件 mtime 和远端 `lastmod`。大小比的是 `sizeEnc`。相等时保留本地（`>=`）。

| `conflictAction` | 双方新建（没有上次记录） | 双方都改了（有上次记录，两边都对不上） |
| --- | --- | --- |
| `keep_newer`（默认） | 时间较新的一侧覆盖另一侧。分支 11 保留本地，12 保留远端 | 同样按时间。分支 16 保留本地，17 保留远端 |
| `keep_larger` | `sizeEnc` 较大的一侧胜出。分支 13 保留本地，14 保留远端 | 同样按大小。分支 18 保留本地，19 保留远端 |
| `smart_conflict` | 见下。分支 302 | 见下。分支 301 |

路径以 `{配置目录}/` 开头时，即使选了 `smart_conflict`，也改按 `keep_newer`，不合并。

Smart Conflict 在本 fork 不需要 PRO 账号。执行时（`pro/src/conflictLogic.ts`）：

- `.md` 或 `.markdown`，且 `sizeRaw` ≤ 1 MB（`MERGABLE_SIZE = 1000 * 1000`）：diff3 合并。有上次内容历史则三方合并；没有则用最长公共子序列当作旧文本做两方合并。结果写回本地和远端。两边字节已经相同则采用这份内容。
- 更大的 Markdown，或非 Markdown：不合并。本地改名为 `名字.dup.扩展名` 后上传，远端文件下载回原来的名字。两边 `sizeRaw` 相同且字节也相同的时候，只按远端元数据回写本地，不再上传一份副本。

**`protectModifyPercentage`（默认 50）。** 计划完成之后、真正推拉之前，在 `doActualSync` 里检查。分母是计划中的文件数：不计文件夹，不计内部键 `/$@meta`，equal 和新建都算在分母里。分子是下面两类文件：

- 决策名含 `modified` 或 `conflict` 的推拉。包括单边修改（9、10）、双向冲突选边（11–14、16–19）、单向冲突（22–27，以及把文件推回或拉回的 32、35）、Smart Conflict（301、302）。这些单向决策名字里带 `conflict`，所以算进分子，哪怕结果是用一边盖住另一边。书签例外（139、140）的决策名同样是 `conflict_created_then_keep_local`，会把该文件推回远端，并计入分子。
- 决策名含 `deleted` 且不含 `folder` 的删除。双向的 4 和 7，以及带删除的单向 38、39。

不计入分子：

- equal：分支 2、21、40。整库 mtime 被改写但哈希相同的文件在这里。这是新版本不再误触发保护的原因。
- 纯新建的推或拉（6、3）。
- `conflict_created_then_do_nothing`（单向时忽略另一侧新建，例如 28、31）。它走「只标记已同步」那一档，不进分子。
- 文件夹、仅历史（两边都已删除，分支 1）、超限跳过（36、37）。

中止条件：分母大于 0，且 `分子 * 100 >= 分母 * 百分比`。设为 100 则去掉保护（百分比为 100 且分子等于分母时也放行）。设为 0 则只要分母大于 0 就中止，包括分子为 0 的时候。设置文案与此一致。中止只是不再执行这次推拉和删除。为了算 SHA-1，做计划时已经发生的 WebDAV 下载不会被这次中止撤销。

### 其它差异

- **没有 PRO 门槛。** 不需要 Remotely Save 账号，也不需要付费。Smart Conflict，以及原先标成 PRO 的远程（OneDrive (Full)、Google Drive、Box、pCloud、Yandex Disk、Koofr、Azure Blob Storage）在本 fork 可用。每个服务仍使用该服务自己的授权。
- **界面是简体中文。** 设置和提示使用简体中文；某条文案没有中文时回退英文。服务名和技术术语保持英文。

本仓库里没有、上面也按未实现写明的：多套 WebDAV 同时配置、123 盘专用协议、pCloud 专有哈希的重新计算、加密密码非空时的内容哈希比较。

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
