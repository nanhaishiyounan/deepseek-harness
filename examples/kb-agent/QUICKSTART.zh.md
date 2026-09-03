# kb-agent 快速上手

面向使用者的中文实操指南：每条命令都可在仓库根目录逐字复制执行（Node 22.19.0 实测验证）。能力细节见 [README.zh.md](README.zh.md)，生产部署见 [DEPLOY.zh.md](DEPLOY.zh.md)，运营站对接见 [WEBSITE.zh.md](WEBSITE.zh.md)。

## 这是什么

kb-agent 是一个食品产业知识库 agent：把走访食品企业得到的纪要、企业档案、法规标准等资料入库，然后向它提问，回答带 `[n]` 编号引用（文档名 + 标题路径），可回溯到原文。对话与向量化由 MiniMax-M3 / embo-01 驱动，知识库是本地一个 SQLite 文件（`workspace/kb.sqlite`），数据不出本机。检索默认返回全部命中；可选相关性阈值 `minRelevanceScore`（默认 0 不启用）让乱码查询落到零结果空态，部署侧在 `cordis.patch.yml` 调整（权衡见 [DEPLOY.zh.md](DEPLOY.zh.md)）。

## 一次性准备

```sh
# 1. Node 22.19.0（nvm；其他版本会在启动时报 node:sqlite 等内置模块缺失）
nvm use 22.19.0

# 2. 安装依赖（pnpm workspaces）
pnpm install

# 3. 在仓库根目录创建 .env（已配置过的跳过）；key 于 MiniMax 开放平台申请：https://platform.minimaxi.com/
echo 'MINIMAX_API_KEY=sk-xxx' >> .env
```

`MINIMAX_API_KEY` 同时服务对话（MiniMax-M3）与向量化（embo-01）；可选 `MINIMAX_BASE_URL=https://api.minimaxi.com/v1`（默认值即此）。没有 key 时入库/检索/统计仍可完整运行（纯文本检索），对话请求会以 `MISSING_CREDENTIAL` 失败。`pnpm dsh` 从源码经 tsx 启动，无需先 `pnpm run build`。

## 5 分钟跑通

以下三条命令按顺序在仓库根目录执行。`DSH_HOME` 把会话与知识库都钉在 `examples/kb-agent/` 内，不污染主目录。

**第一步：入库示例语料**（六篇脱敏文档：会议纪要、企业档案、法规摘录）：

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml "用 kb_ingest 逐篇入库这六篇文档：examples/kb-agent/workspace/data/meetings/2026-08-20-supplier-visit-hongfa.md 与 examples/kb-agent/workspace/data/meetings/2026-08-27-project-kickoff.md（doc_kind 取 meeting）、examples/kb-agent/workspace/data/profiles/hongfa-food.md 与 examples/kb-agent/workspace/data/profiles/lvyuan-ingredients.md（doc_kind 取 profile）、examples/kb-agent/workspace/data/regulations/gb2760-excerpt.md 与 examples/kb-agent/workspace/data/regulations/gb14881-excerpt.md（doc_kind 取 regulation），完成后用 kb_stats 报告覆盖情况"
```

预期输出报出 6 文档 / 38 chunks、全部已嵌入、检索模式 hybrid。

**第二步：提一个问题**：

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml "调味品企业的食品添加剂合规要点是什么？"
```

预期回答以 `[n]` 引用文档名与标题路径（GB 2760 摘录、走访纪要、企业档案），文末列出引用清单。

**第三步：查看用量**：

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml "用 kb_stats 报告知识库用量"
```

预期报出租户 `demo-food-co`、文档数、分块数、累计搜索/入库/嵌入计数。

## 导入我自己的资料

**上传本地文件（推荐，随时随地）**：打开 Web 工作台的「知识库」页签 → 文档区「添加文档」→「上传本地文件」，选择本机的 .md / .txt / .pdf / .docx 文件（可多选，单文件最大 64 MiB），选完即自动入库——每份文件一行进度，成功显示入库片段数。上传的文件会落在服务器工作区 `workspace/data/uploads/` 下，引用身份即文件名；同名文件再次上传会替换旧文档（与 `kb_ingest` 同路径幂等语义一致）。浏览器能打开工作台就能上传，不需要在服务器上预先放置文件。

**网页**：工作台向导切到「网页链接」页签粘贴 URL（或让 agent 抓取一个 http(s) 页面入库），引用身份即 URL：

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml "用 kb_ingest_url 把 https://example.com/ 入库，doc_kind 取 other，然后 kb_search 查询它页面的用途"
```

**服务器文件（服务器管理员场景）**：文件已经在服务器磁盘上、又不方便走浏览器上传时，才用这条通道——由管理员把文件放进示例语料区再按确切路径入库。`import-real-docs.sh` 完成拷贝，`--kind` 白名单为语料目录名：

```sh
bash examples/kb-agent/scripts/import-real-docs.sh /path/to/真实纪要.md /path/to/标准目录/ --kind meetings   # 或 profiles | regulations
```

然后入库（agent 无法列目录，必须在指令里写出拷入后的确切文件名）：

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml "用 kb_ingest 把 examples/kb-agent/workspace/data/meetings/真实纪要.md 入库，doc_kind 取 meeting，然后 kb_search 查询它记录的成本口径"
```

语料目录结构即分类：`workspace/data/` 下 `meetings`（走访纪要）、`profiles`（企业档案）、`regulations`（法规标准）三类可经脚本拷入，目录名映射 `doc_kind`（meeting / profile / regulation）。真实纪要先脱敏再入库，绝不把含密文件拷进仓库。

私网/内网地址默认被拒绝。

## 换角色

网页版首屏的场景门户是换角色的首选入口：30 张场景卡按市场洞察、工艺、食品安全、成本、供应链、出海、设备、数据资产八类分组，点击卡片弹出角色确认框（描述 + 示例问题），点"开始会话"即以该角色开新会话，示例问题已预填输入框。2026-09-02 实测（Node 22.19.0）：点击"企业数据助手"卡并在确认框点"开始会话"，会话头部角色变为"企业数据助手"、输入框预填"水电气 单耗"。`cordis.patch.yml` 把 `examples/kb-agent/scenarios/` 挂为预设根，场景角色随组合自带可达——任何 `DSH_HOME` 下启动网页版都能选到全部 30 个场景，零复制。

`examples/kb-agent/agent-presets/` 另挂两个角色预设——**AI 食安合规官**（`food-compliance-officer`，依据 GB 2760/GB 14881 等法规作答并输出审核要点清单）与**企业数据助手**（`enterprise-data-assistant`，覆盖市场/工艺/食安/成本/供应链五类问答，网页版新建会话的默认角色）；门户里"AI 食安合规官"与"企业数据助手"两张同名场景卡就是这两个角色的点击入口。预设只在网页版工作台生效：命令行 headless 会话始终是 kb-agent 基础角色，不挂预设。

自建预设才需要复制——把它放进 `$DSH_HOME` 的预设可写根即可进入可选列表：

```sh
mkdir -p examples/kb-agent/.dsh/.agent-presets
cp -R <你的预设目录> examples/kb-agent/.dsh/.agent-presets/
```

默认角色可写入 `examples/kb-agent/.dsh/settings.yaml` 覆盖组合默认（取值为 roster 里的预设 id，场景卡对应场景 id，如 `food-compliance`）：

```yaml
agent-presets:
  default: food-compliance
```

## 网页版工作台

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml
```

启动后输出 `dsh web: http://127.0.0.1:3080` 并自动打开浏览器（`--no-open` 关闭自动打开）。工作台无鉴权，只在本机使用，不要暴露到公网。新建会话默认使用企业数据助手预设（见上节换角色）。暗色外观跟随系统设置。

首屏是知识库门户：产品名与一句话价值、用量行（文档数 · 检索次数 · 场景数）、示例问题（点击填入输入框）、30 个场景卡（按市场洞察、工艺等八类分组，点击卡片经确认框后以该角色开新会话，见"换角色"节）。

![门户首屏（亮色）](../../screenshots/kb-redesign/01-hero-light.png)

发出第一个问题后，会话顶部出现"对话 | 知识库 | 轨迹"页签。**知识库**页签是检索工作台：输入关键词（如"山梨酸"）检索，每条结果卡带编号徽标、来源（文档名 — 标题路径）、命中高亮和"引用并提问"（把该来源带回对话继续问）；下方是文档区（本次会话入库记录与文档总数）与累计用量。

![知识库工作台检索结果](../../screenshots/kb-redesign/03-workbench-search-light.png)

文档区点"添加文档"打开入库向导：**上传本地文件**页签（默认）直接选本机文件即入库（可多选）；**网页链接**页签粘贴 URL；**服务器文件**页签浏览目录选中文件（桌面默认安装无法浏览服务器文件时，向导会引导改用上传或网页链接——需要服务器文件时把文件放进工作区后让 agent 以 `kb_ingest` 入库，见上节导入我自己的资料）。

![入库向导](../../screenshots/kb-redesign/05-workbench-ingest.png)

侧栏的**知识库**入口始终显示当前文档数徽标，有会话时点击直达知识库页签；设置里的**知识库**页展示用量明细。会话内每次 agent 检索都渲染为编号来源卡，展开可核对原文摘录与命中词。

![会话内编号来源卡](../../screenshots/kb-redesign/07-toolview-citations.png)

## 场景库

[scenarios/](scenarios/README.zh.md) 提供 30 个角色场景（AI 营销洞察主管、智能品控主管、AI 食安服务主管、AI 退税管家等），每个场景含角色预设、专用脱敏语料与技能说明。校验全部场景：

```sh
pnpm vitest run examples/kb-agent/tests/scenarios.spec.ts
```

试用某个场景：把它的语料入库后按场景问题提问。以"AI 营销洞察主管"（market-insight）为例：

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml "用 kb_ingest 把 examples/kb-agent/scenarios/market-insight/data/corpus.md 入库（doc_kind 取 report），然后回答：电商渠道 GMV 表现如何？"
```

预期回答按"品类规模—渠道结构—机会点"组织并带 `[n]` 引用。

## 质量评测

100 题检索评测（`eval/questions.json`），两种模式：

```sh
# 纯文本模式（无需 key）
node --import tsx/esm examples/kb-agent/scripts/eval-retrieval.mts

# 混合模式（需 .env 里的 MINIMAX_API_KEY）
DSH_EVAL_HYBRID=1 node --import tsx/esm examples/kb-agent/scripts/eval-retrieval.mts

# 混合模式 + 引用有效性（每题真实问答，约 7 分钟）
DSH_EVAL_HYBRID=1 node --import tsx/esm examples/kb-agent/scripts/eval-retrieval.mts --answers
```

2026-08-31 实测（Node 22.19.0）：纯文本 Top5 命中 71%，混合模式 Top5 命中 99%，引用有效率 96%。明细写入 `eval/results-text.json` / `eval/results-hybrid.json` / `eval/results-hybrid-answers.json`——三个结果文件由上述命令随时可再生，不入库（`.gitignore` 已忽略），`eval/questions.json` 随仓库分发。

## 常见问题

- **启动报 `No such built-in module: node:sqlite`**：Node 版本过低。执行 `nvm use 22.19.0` 后重试；本仓库要求 Node 22.19+。
- **拔掉 embed key 后还能用吗**：能检索。没有 `MINIMAX_API_KEY` 时每次 `kb_search` 以 `mode: 'text'` 纯文本运行、`embed_available: false`，入库/检索/统计闭环完整；仅对话请求以 `MISSING_CREDENTIAL` 失败。key 写入根 `.env` 或导出环境变量后两半都工作（仅经工作台 Models 页存入的 key 服务对话但不服务向量）。
- **换企业/换租户**：租户是部署配置不是对话参数——`cordis.patch.yml` 的 `tool-kb` 行读取环境变量 `DSH_KB_TENANT`（默认 `demo-food-co`），模型从不提供租户。一家企业一个部署，见 [DEPLOY.zh.md](DEPLOY.zh.md) §3。
- **升级后启动报 schema version 不兼容**：旧知识库文件被新构建拒绝（fail-loud），报错含盘上版本号。从源文档重新入库，或恢复同版本备份；不要手改 SQLite 文件。本示例的旧 v1 库已改名 `workspace/kb.sqlite.v1-backup` 留存（新库随后自动重建），旧库不会被新构建读取；升级与回滚的完整处理见 [DEPLOY.zh.md](DEPLOY.zh.md) §6。
- **对话报错 `duplicate tool_call id (2013)` 或工具调用显示 `unknown tool`？**：这是 2026-09-02 已修复的 MiniMax 并行工具调用聚合缺陷（模型并行调用多个工具时，流式续传片段的空 id/name 覆盖了正确身份）。修复后新会话的并行检索正常；**此前因此报废的旧会话在重启服务后也能继续使用**（发送端防线会自动修复历史中的空 id）。若仍遇此错，重启 Web 服务即可。
- 更多细节：[README.zh.md](README.zh.md)（能力与已知限制）、[DEPLOY.zh.md](DEPLOY.zh.md)（私有化部署）、[WEBSITE.zh.md](WEBSITE.zh.md)（运营站对接）。

## 生产部署

单台 Linux 主机、systemd 守护、SQLite 单文件备份即可跑一个租户；网关无鉴权只留 localhost 或置于带鉴权的反向代理之后。完整步骤（安装、配置、备份恢复、升级、安全要点）见 [DEPLOY.zh.md](DEPLOY.zh.md)。
