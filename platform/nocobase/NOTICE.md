# NOTICE

本目录是 NocoBase 2.2.6 源码快照（隔离式并入，非 vendoring——不 rescope、
不改包名、不改运行时插件解析）。上游信息、排除清单与本地修改登记见
[MANIFEST.md](MANIFEST.md)。

## 产品归属与许可

- NocoBase © NocoBase Contributors（https://github.com/nocobase/nocobase）。
- 许可为 Apache-2.0 全文 + NocoBase 补充条款，全文见本目录
  [LICENSE.txt](LICENSE.txt)（NocoBase License Agreement，Updated Date:
  February 24, 2026）与 [LICENSE-APACHE.txt](LICENSE-APACHE.txt)。两者不一致时
  以补充条款为准（LICENSE.txt §4.2）。
- 各 `packages/**/LICENSE` 为包级 Apache-2.0 副本。以下 4 个插件缺包级 LICENSE
  文件（block-comment、idp-oauth、mcp-server、ui-layout），由根 LICENSE.txt
  兜底：`@nocobase-example/*` 21 个示例包亦无包级 LICENSE，属上游 dev-only
  现状。

## 修改声明（Apache-2.0 §4(b)）

快照首次并入时未修改任何上游源文件；`yarn install` 后 postinstall 会在本目录
生成 `tsconfig.paths.json` 并从 `.env.example` 复制 `.env`（均为工具链生成物，
非源码修改）。此后一切对源文件的修改在 MANIFEST.md 的 local-modifications
表登记。

## 文件头声明保留

全部源文件头部的版权与许可声明（含 AGPL-3.0 dual-license 历史字样）按
LICENSE.txt §5.3 原样保留，不得移除或改写。
