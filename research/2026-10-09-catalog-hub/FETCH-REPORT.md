# 抓取执行报告 — research/2026-10-09-catalog-hub

数据抓取子任务实录。只陈述事实，不含分析结论。

- 抓取窗口：2026-10-10 00:42 – 01:02（Asia/Shanghai, UTC+8）
- 输出目录：`research/2026-10-09-catalog-hub/raw/`（95 个文件）
- 清单文件：`research/2026-10-09-catalog-hub/manifest.tsv`（95 数据行 + 1 表头，列：filename / url / http_code / bytes；与 raw/ 文件逐一对账零差异）
- 抓取命令形态（全部请求统一）：`curl -sSL --max-time 30 -H 'User-Agent: research-curl' -o <file> -w '%{http_code}'`
- 状态码分布：200 ×70、404 ×15、403 ×9、no-docker-cli ×1（C2 组跳过标记）

## 1. GitHub API 配额（A 组收尾实测）

| 时点 | core remaining | 说明 |
|---|---|---|
| A 组首跑结束（00:44） | 0 / 60 | 匿名配额耗尽，出口 IP `89.187.185.68`，reset=2026-10-10 00:59:51 (+08)。证据：`raw/gh-rate-limit.json`、9 个 403 响应体（279 字节，含 "API rate limit exceeded"） |
| 全部重试结束后（01:02） | 41 / 60 | 证据：`raw/gh-rate-limit-after.json` |

- 本机 `gh` CLI 存在（/usr/local/bin/gh）但未登录任何 host（`gh auth status` 输出如实记录），认证恢复路径不可用；A 组失败项通过等待匿名配额 reset 后用同形态 curl 重试恢复。

## 2. 各组结果

### A 组：GitHub API（16 个端点，最终 16/16 拿到 200 内容）

- polaris / gravitino 首跑即成功（6 项）。
- unitycatalog / nessie / amoro 共 9 项首跑 403（配额耗尽，见上）；原始 403 文件保留，reset 后以 `*-retry.json` 重试全部成功。
- gravitino releases-list 首跑 30 秒超时截断（11059 字节部分 JSON，curl exit 28）；重试 `gh-gravitino-releases-list-retry.json` 完整（515699 字节）。
- nessie releases-list 第一次重试再截断（9521 字节，`gh-nessie-releases-list-retry.json` 保留）；第二次重试 `gh-nessie-releases-list-retry2.json` 完整（227601 字节，JSON 可解析，10 条 entry）。
- 最新 release 事实（从 latest JSON 提取）：polaris `apache-polaris-1.8.0`（2026-09-28）；gravitino `v1.3.1`（2026-09-30）；unitycatalog `v0.6.0`（2026-08-20）；nessie `nessie-0.109.0`（2026-10-08）；amoro `v0.8.1-incubating`（2025-09-11）。

### B 组：npm registry（10/10 落盘）

- 200 ×6：npm-search-gravitino / unitycatalog / nessie / iceberg / uc-client、npm-pkg-iceberg-js。
- 404 ×4（响应体均为 21 字节 `{"error":"Not Found"}`）：`@tabulario/iceberg-js`、`@unitycatalog/unitycatalog-ts`、`@unitycatalog/unitycatalog-ui`、`pynessie`。其中 pynessie 为任务书预告的对照项。

### C 组：Docker Hub tags API（5/5 落盘）

- 200 ×3：apache/polaris（tag count 14）、apache/gravitino（86）、apache/amoro（55）。
- 404 ×2（43 字节）：`unitycatalog`、`projectnessie` 官方命名空间不存在（任务书预告"可能404"）。

### C2 组：docker manifest inspect — 跳过

- 本机无 docker CLI（`command -v docker` 无结果）。写入 `raw/dm-SKIP.txt` 说明，manifest 标记 `no-docker-cli`。
- 未执行任何 docker 命令（pull/run/start 全程零执行；docker 相关仅此事实记录）。

### D 组：官方文档站（索引 6 + 补救导航 6 + 第二批 38 页）

**索引与域名定位事实（按任务书"grep 不出则转 sitemap"协议执行）：**

- `https://polaris.apache.org/docs/latest/` → 404（服务器级 404 页，196 字节）。改抓 `sitemap.xml`（65933 字节）定位：文档按版本目录组织 `/releases/<ver>/…` 与 `/in-dev/unreleased/…`；最新为 1.8.0。
- `https://gravitino.apache.org/docs/` → 200 但为 301 字节 meta-refresh 壳，跳转 `/docs/1.3.1/`；真实索引 `https://gravitino.apache.org/docs/1.3.1/`（37614 字节）已落盘（`gravitino-docs-idx-131.html`）。
- `https://unitycatalog.io/docs/` → 404（10681 字节 Astro 404 壳）；`https://go.unitycatalog.io/docs` 跟随后落地页 canonical 写 `www.unitycatalog.io/`，但该域下 `/quickstart/` 等平铺路径全部 404（7 项，原始 404 文件保留）；实测真实文档域名为 `docs.unitycatalog.io`，`https://docs.unitycatalog.io/quickstart/` 200（147044 字节），其余 6 页以 `uc-docs-*.html` 补抓成功。`uc-sitemap-index.xml`（195 字节）指向子 sitemap `https://unitycatalog.netlify.app/sitemap-0.xml`（未抓）。
- `https://go.unitycatalog.io/apidocs` → 200 但为 React SPA splash 壳（2340 字节，静态 chunk 引用）；API 文档内容由 JS 渲染，curl 不可得（`uc-apidocs.html`）。
- projectnessie 首页无 clients/iceberg/rest 链接（144347 字节营销页）；按协议转抓 `https://projectnessie.org/sitemap.xml`（1390941 字节）定位。

**第二批内容页（每站 ≤8，共 polaris 7 + gravitino 8 + uc 8 + nessie 8 = 31，另 fileset 截断补抓 1）：**

- polaris（releases/1.8.0）：docs 索引、helm-chart/persistence、configuration、configuration-reference、configuring-polaris、configuring-polaris-for-production、metastores/relational-jdbc（7 页全 200）。
- gravitino（docs/1.3.1）：iceberg-rest-service、lakehouse-iceberg-catalog、lakehouse-generic-catalog、fileset-catalog（首抓截断 6072 字节，`-retry` 完整 48131 字节）、model-catalog、manage-relational-metadata、jdbc-postgresql-catalog、security/access-control（8 页全 200）。
- uc（docs.unitycatalog.io）：quickstart、docker_compose、usage/ui、usage/cli、ai/client、ai/quickstart、usage/tables/formats（7 页 200）+ apidocs SPA 壳（200）。
- nessie：nessie-latest/client_config、develop/rest、guides/iceberg-rest、iceberg/{iceberg,spark,trino,flink,hive}（8 页全 200）。

## 3. 失败 / 截断 / 跳过总清单（manifest 均有行）

| 类别 | 文件 | 状态 |
|---|---|---|
| GitHub 403（配额） | gh-unitycatalog-{repo,latest,releases-list}.json、gh-nessie-{repo,latest,releases-list}.json、gh-amoro-{repo,latest,releases-list}.json | 403；全部已被 `*-retry.json`（200）替代 |
| 超时截断（curl exit 28，200 部分内容） | gh-gravitino-releases-list.json（11059 B）、gh-nessie-releases-list-retry.json（9521 B）、gravitino-fileset-catalog.html（6072 B） | 分别被 -retry / -retry2 / -retry 完整文件替代；原始截断文件保留 |
| npm 404 | npm-pkg-tabulario.json、npm-pkg-uc-ts.json、npm-pkg-uc-ui.json、npm-pkg-pynessie.json | 真实 404，无重试价值 |
| Docker Hub 404 | dh-unitycatalog.json、dh-projectnessie.json | 真实 404（官方命名空间不存在） |
| 文档站 404 | polaris-docs.html（/docs/latest/）、uc-docs-idx.html（unitycatalog.io/docs/）、uc-quickstart.html 等 7 个 www 域平铺路径 | 域名/路径不存在；已由 sitemap 定位或 docs.unitycatalog.io 补抓替代 |
| 跳过 | dm-SKIP.txt | 无 docker CLI |
| SPA 不可抓 | uc-apidocs.html | 200 但为 JS 渲染壳 |

## 4. 任务书点名要求定位的真实 URL

- **gravitino catalog 类型清单/矩阵**：`https://gravitino.apache.org/docs/1.3.1/`（索引页含 `#catalogs` 段，`raw/gravitino-docs-idx-131.html`）；各 catalog 类型专页均挂在该目录下（lakehouse-iceberg / lakehouse-generic / lakehouse-hudi / lakehouse-paimon / fileset / model / kafka / apache-hive / jdbc-{mysql,postgresql,clickhouse,doris,starrocks,oceanbase,hologres}）。任务书猜测的 `catalog-manage` 页名在 1.3.1 索引中不存在；对应内容页为 `manage-relational-metadata-using-gravitino`、`manage-fileset-metadata-using-gravitino`、`manage-model-metadata-using-gravitino`。
- **polaris 持久化页**：`https://polaris.apache.org/releases/1.8.0/helm-chart/persistence/`、`https://polaris.apache.org/releases/1.8.0/metastores/relational-jdbc/`、`https://polaris.apache.org/releases/1.8.0/configuration/configuration-reference/`（均 200 落盘）。
- **nessie clients 页**：`https://projectnessie.org/nessie-latest/client_config/`（200 落盘）；版本化 client-config 生成文档在 sitemap 的 `nessie-0.*/generated-docs/client-config-*` 路径下。

## 5. 发现但未抓的候选 URL（超出每站 8 页配额或非任务书关键词）

**polaris（sitemap 全量在 `raw/polaris-sitemap.xml`）：**

- `https://polaris.apache.org/releases/1.8.0/configuration/configuring-polaris-for-production/configuring-aws-s3-cloud-storage-specific/`（azure/gcs 同构 3 页）
- `https://polaris.apache.org/in-dev/unreleased/configuration/` 系列（未发布版文档树）
- `https://polaris.apache.org/guides/jdbc/`、`https://polaris.apache.org/tags/jdbc/`、`https://polaris.apache.org/tags/postgres/`

**gravitino（1.3.1 目录，索引在 `raw/gravitino-docs-idx-131.html`）：**

- `apache-hive-catalog`、`kafka-catalog`、`lakehouse-hudi-catalog`、`lakehouse-paimon-catalog`
- `jdbc-mysql-catalog`、`jdbc-clickhouse-catalog`、`jdbc-doris-catalog`、`jdbc-starrocks-catalog`、`jdbc-oceanbase-catalog`、`jdbc-hologres-catalog`
- `manage-fileset-metadata-using-gravitino`、`manage-model-metadata-using-gravitino`
- `security/how-to-authenticate`、`security/local-users-and-groups`、`security/how-to-use-https`、`security/how-to-use-cors`
- 索引锚点：`#gravitino-iceberg-rest-catalog-service`、`#gravitino-lance-rest-catalog-service`、`#security`

**unitycatalog（docs.unitycatalog.io，导航页在 `raw/uc-docs-go-redirect.html`）：**

- `https://docs.unitycatalog.io/usage/tables/deltalake/`、`/usage/tables/uniform/`、`/usage/volumes/`、`/usage/models/`、`/usage/functions/`
- `https://unitycatalog.netlify.app/sitemap-0.xml`（子 sitemap，全站 URL 清单）
- `https://www.unitycatalog.io/blogs`

**nessie（sitemap 全量在 `raw/nessie-sitemap.xml`，1390941 字节）：**

- `https://projectnessie.org/guides/docker/`、`/guides/kubernetes/`、`/guides/minikube/`、`/guides/sql/`、`/guides/tables-views/`、`/guides/ui/`、`/guides/try-nessie/`
- `https://projectnessie.org/develop/spec/`、`/develop/python/`、`/develop/java/`、`/develop/kernel/`
- `https://projectnessie.org/iceberg/views/`
- `https://projectnessie.org/nessie-nightly/client_config/`
- 博客：`https://projectnessie.org/blog/2024/05/13/nessie-integration-of-iceberg-rest/`
