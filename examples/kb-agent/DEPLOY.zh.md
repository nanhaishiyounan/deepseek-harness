# kb-agent 私有化部署指南（单租户）

[English](DEPLOY.md) | 中文

本指南在单台 Linux 主机上部署一个 kb-agent 租户，不引入新基础设施：进程守护用 systemd，知识库是一个 SQLite 文件，唯一密钥是 MiniMax API key。

## 1. 前置条件

- Node.js 22.19+（nvm 可）与 pnpm 9+。
- MiniMax API key（`MINIMAX_API_KEY`）：chat（MiniMax-M3）与向量化（`embo-01`）共用。无 key 时部署仍可运行于 text-only 降级模式（每次检索 `mode: 'text'`）——上线前先确认是否接受。
- 专用系统用户（示例 `dsh`）与可写数据目录（示例 `/srv/kb-agent`）。

## 2. 安装与构建

```sh
git clone <本仓库> /srv/kb-agent/app
cd /srv/kb-agent/app
pnpm install
pnpm run build
```

## 3. 配置

创建 `/srv/kb-agent/.env`（仅属主可读）：

```sh
MINIMAX_API_KEY=sk-...
# 可选覆盖：
# DSH_KB_TENANT=my-company        # 工具/预设/工作台的租户绑定（默认 demo-food-co）
# MINIMAX_BASE_URL=https://api.minimaxi.com/v1
# W3_TERMINAL_BASE=http://内网主机:13110  # 三个操作者终端页 iframe 的引擎服务源（默认 http://127.0.0.1:13110；改后重跑 w4-heal-b3.mts --iframe 生效）
```

`DSH_KB_TENANT` 是租户的单一事实源：`cordis.patch.yml` 用它读取 `tool-kb` 的 `tenant`、预设行与 api-gateway 的 `kbTenant`（三处未设置时都回落 `demo-food-co`）。一个部署 = 一个租户；第二家企业起第二个部署、独立数据目录。

### 检索相关性阈值（可选）

kb 缝配置接受 `minRelevanceScore`（默认 0 —— 保留全部命中）：按融合 RRF 分数丢弃低于阈值的命中，hybrid 与 text-only 两路一致，乱码查询因此可能解析为零结果空态而非 top-N 噪声。RRF 分数是按排名阻尼的倒数：单路命中至多 `1/(rrfK+1)`（默认 rrfK 60 时为 0.0164），双路命中至多 `2/(rrfK+1)`。超过 `1/(rrfK+1)` 的阈值（如 0.017）只保留双路命中——在示例语料上它清空全部乱码探针，但也清空约 28% 的 eval 问题（其 gold 文档只走向量一路、全文路径零命中），启用前按自身语料权衡抗噪与单路召回；不超过 `1/(rrfK+1)` 的阈值只修剪深排名噪声。在 `cordis.patch.yml` 的 `kb` 行配置（`config: { minRelevanceScore: 0.017 }`）；标定数据与方法：`examples/kb-agent/scripts/calibrate-relevance.mts`。

## 4. 数据目录、备份与恢复

知识库是 `examples/kb-agent/workspace/kb.sqlite`（WAL 模式：进程停止时连同 `-wal`/`-shm` 一起复制；进程运行中用 SQLite backup API）。会话数据在 `$DSH_HOME` 下（设为 `/srv/kb-agent/.dsh`，避免落入用户主目录）。

```sh
# 冷备份（进程已停止）：
tar czf /srv/kb-agent/backups/kb-$(date +%F).tgz -C /srv/kb-agent/app/examples/kb-agent/workspace kb.sqlite*
# 恢复：停服务 → 解包覆盖 workspace → 起服务。
```

会话历史需要保留时，`.dsh` 会话根目录同样备份。

## 5. systemd 单元

`/etc/systemd/system/kb-agent.service`：

```ini
[Unit]
Description=kb-agent (food-industry knowledge base + agent)
After=network-online.target

[Service]
Type=simple
User=dsh
WorkingDirectory=/srv/kb-agent/app
Environment=DSH_HOME=/srv/kb-agent/.dsh
EnvironmentFile=/srv/kb-agent/.env
ExecStart=/srv/kb-agent/app/node_modules/.bin/tsx /srv/kb-agent/app/apps/cli/src/bin.ts --profile headless --patch examples/kb-agent/cordis.patch.yml "待命：等待任务输入"
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

headless profile 从 argv 取任务，单次任务天然映射到 `systemd-run --unit=kb-task-…` 或 timer 单元；常驻面（Web 工作台，同一组 patch 的 `dsh web`）用同样单元形态换 web 入口。`systemctl enable --now kb-agent` 后用 `journalctl -u kb-agent -f` 验证：fail-loud 的启动诊断会直接打出。

### 夜间任务（制造业链路，可选，W2-B7）

审批引擎 `approval-engine.mts --serve` 可内置夜间链（ROP 补货扫描 → MRP 日结 →〔月末〕月度收发存快照 → KPI 物化；季初月每日幂等重算追加供应商绩效计分），替代外部 cron 逐动词 curl。默认关闭——不带 env 启动时与外部 cron 形态完全一致（零漂移），四动词手动 curl 路径永久保留：

```ini
# 追加到 [Service] 段（.env 里写三行 EnvironmentFile 亦可）
Environment=W1_NIGHTLY_ENABLED=true   # 默认 false；仅接受 true/false，非法值启动即拒
Environment=W1_NIGHTLY_AT=02:30       # HH:MM，默认 02:30；非法值启动即拒
Environment=W1_NIGHTLY_TZ=Asia/Shanghai  # 默认沪时区（与 KPI 沪日界一致）
```

要点：任一腿失败记日志后继续下一腿（互不阻断）；`POST :13110/run-nightly` 随时手动触发一次（不占当日去重标记）；进程内标记按天去重，重启可能同日补跑一次——各腿均幂等。内置定时器与外部 cron 二选一，勿双跑。macOS 开发环境的 launchd/cron 演示路径见 QUICKSTART「制造业全链闭环」一节。

## 6. 升级

停服务 → `git fetch && git checkout <tag>` → `pnpm install && pnpm run build` → 起服务。schema 所有权 fail-loud：异版本知识库文件在启动时被拒，报错信息含盘上版本号——恢复对应备份，不要手改文件。

没有可恢复的备份时，把被拒文件改名留存，下次启动自动重建空库（再重新入库语料）：

```sh
mv examples/kb-agent/workspace/kb.sqlite examples/kb-agent/workspace/kb.sqlite.v1-backup
```

v2 备份不会因为升级而重新可读：v3 构建同样拒绝它（schema 版本只前进）。在 v3 上重建语料的正确路径是从源文档重新入库（`workspace/data/` 走 ingest 工具链），或恢复一份 v3 构建自己写的备份。回滚 = 代码与库一起回：checkout 旧 tag **并**恢复旧库文件——v3 写的库配 v2 代码同样过不了启动门。

## 7. 安全要点

- 网关（`dsh web` / api-gateway 插件）**无鉴权**：严禁暴露公网。kb 写方法（`kb.ingest`、`kb.ingestUrl`）默认只读（不设 `kbWriteEnabled`）；本示例的 patch 显式开启，因为部署是单租户且在磁盘级访问控制之后。
- `kb.ingest` 读取传入的任意路径：写方法开启后，能到达网关的攻击者可把主机上任何可读文件入库（任意文件读链）。网关只留 localhost 或放在带鉴权的反向代理之后。
- `.env` 与 SQLite 文件承载租户语料：磁盘级访问控制（专用用户 + 仅属主权限）就是边界。
- `kb_ingest_url` 默认拒绝私网地址（`allowPrivateNetworks` 默认 false）——对互联网暴露的部署保持默认。
- `W3_TERMINAL_TOKEN` 未设置时，车间终端/审批设计器的窄端点以 lenient-demo 档裸奔（本机演示默认；`approval-engine --serve` 启动日志与响应标记都会明示）。生产部署必须设置：设后全部终端端点与 `/designer`、`/flow-graph`、`/flow-graph/publish` 改为 strict 档——缺 token/错 token 一律 401（header `x-terminal-token`、query `?token=`，或首次经 URL 注入后由 localStorage 复用）。令牌同为 iframe 宿主页（W3 终端、W5 审批流配置中心）的鉴权通道；`W3_TERMINAL_BASE` 指向引擎服务地址，缺省 `http://127.0.0.1:13110`。
- 本组合 disable 了 base bundle 的 shell/editor/web 工具行（见 `cordis.patch.yml`）：部署内所有 agent 只从知识库作答。重新启用是明确的组合变更，按变更评审。
