# W9 验收证据索引（mobile 三问题 + 「酱园琥珀」视觉重设计）

> 本目录是 W9 轮全部证据的唯一归档处（plan §二·4）。按批次分组，每文件一句话说明；活体证据均取自真实网关（127.0.0.1:3080）+ 真实模型流，无摆拍。设计基准：[design-language-w9.md](design-language-w9.md)。

## B1 预制 tag 辅助输入

- `w9-b1-01-tag-fill-input-375.png` — 点欢迎卡 starter 后输入框值=send 文本、聚焦、光标置尾、无消息发出、欢迎屏仍在。
- `w9-b1-02-draft-replaced-375.png` — 已有半句草稿时点下一个 starter，草稿被整体替换（F1）。
- `w9-b1-03-choice-still-sends-375.png` — 围栏 ask_choice 选项点击仍即时发送（回归）。
- `w9-b1-tag-fill.gif` — 点击→填入→改写→发送全流程 GIF（真实模型回复同框）。
- `w9-b1-live-probe.log` — 活体探针日志（A/B/C 三腿断言全 PASS）。
- `w9-b1-unit-tests.log` — B1 批 ui-mobile spec 运行结果。

## B2 身份注入服务端化

- `w9-b2-00-empty-section-probe.log` / `.mts` — 空态 section 渲染探针（PC/CLI/keyless 无身份段不污染 system 文本）。
- `w9-b2-01-user-bubble-clean-375.png` — 新会话用户气泡正文三层无「【登录身份】」。
- `w9-b2-02-system-identity-assert.log` — LLM 请求 system 含 token 派生身份段断言。
- `w9-b2-03-forge-identity-neg.log` — 手打伪造身份文本负向：system 段不变、待办仍按真实用户。
- `w9-b2-04-cross-user-todos-neg.log` — 跨用户负向：buyer 看不到 qc_inspector 的待办（逐行 user=buyer）。
- `w9-b2-05-legacy-fold-375.png` — 旧会话回放首行注入行被 UI 折叠、正文正常显示。
- `w9-b2-negative-probe.log` — 负向探针汇总日志。

## B3 设计方向裁决

- `w9-b3-01-design-directions.png` / `-sheet.html` — 三案（D1 酱园琥珀 / D2 晨光仪表 / D3 食谱书页）对照图与源页。
- `w9-b3-02-{d1,d2,d3}-home-mock-375.png` — 三案 home mock 375 截图。
- `w9-b3-03-{d1,d2,d3}-chat-mock-375.png` — 三案 chat mock 375 截图。
- `design-language-w9.md` — 裁决定稿：方向卡六要素 + 六条打分 + token 全表（亮/暗）+ `--adm-*` 映射 + B4~B6 落地指引 + mock 瑕疵附录。
- `mock/d1-home.html` … `mock/d3-chat.html` — 6 个可复渲染 mock 源。

## B4 视觉基座重铸

- `w9-b4-01-shell-light-375.png` / `w9-b4-02-shell-dark-375.png` — 新基座壳双轨截图。
- `w9-b4-03-tokens-diff.md` — tokens.css 重写差异记录。
- `w9-b4-04-spec-run.log` — B4 批 spec 运行结果（43 文件全绿）。
- `w9-b4-light-probe.mjs` / `.json` / `w9-b4-gate.log` — 19 项探针（W8 11 项语义保留 + W9 增量；B5/B6 页面落地后连动取样点复跑，最终 19/19 ALL PASS）。

## B5 首屏 + 聊天流

- `w9-b5-01-home-{375,390}x{light,dark}.png` — home 四象限（hero 酱印 + 节气 + 两列大卡 + 胶囊章 chips）。
- `w9-b5-02-chat-{375,390}x{light,dark}.png` — chat 四象限（纸标签气泡 + 印章发送钮 + 台账纸富消息卡）。
- `w9-b5-03-home-before-after-375.png` — home before/after 并排（before 取 w8-b1-02-home-light）。
- `w9-b5-04-chat-before-after-375.png` — chat before/after 并排（before 取 w8-b2-02-chat-flow-split）。
- `w9-b5-05-title-stripped-chats-375.png` — 旧会话 stamp 标题在 chats 列表被剥离（降级 fallback）。
- `w9-b5-06-title-stripped-header-375.png` — 同一剥离在 chat 顶栏（S4）。
- `w9-b5-chat-flow.gif` — B1 填入 + B2 纯净气泡同框 GIF（点 starter→填入→发送→AI 回复，气泡无身份行）。
- `w9-b5-live-probe.log` — 17 项活体断言全 PASS（酱印/批次号/节气/两列大卡/印章发送钮/标题剥离/GIF）。

## B6 全页面落地（12 路由矩阵）

- `w9-b6-01-home-375-light.png`（+ `-dark`）— 首页。
- `w9-b6-02-chats-375-light.png` — 全部会话层。
- `w9-b6-03-chat-375-light.png` — 聊天详情层。
- `w9-b6-04-work-375-light.png`（+ `-dark`）— 工作台账。
- `w9-b6-05-workdetail-375-light.png` — 工作详情（buyer 账号的真实 wfl_mobile_work 行）。
- `w9-b6-06-tasks-375-light.png` — 任务。
- `w9-b6-07-files-375-light.png` — 文件。
- `w9-b6-08-agents-375-light.png`（+ `-390-light`）— AI 同事目录。
- `w9-b6-09-me-375-light.png`（+ `-dark`）— 我的。
- `w9-b6-10-todos-375-light.png`（+ `-390-light`）— 我的待办。
- `w9-b6-11-alerts-375-light.png` — 我的预警。
- `w9-b6-12-docs-375-light.png` — 看单据。
- `w9-b6-13-form-375-light.png` — 表单面（真实登记请求驱动的 v3 卡）。
- `w9-b6-14-login-375-{light,dark}.png` — 登录页双轨（品牌酱印 + 胶囊章 CTA）。
- `w9-b6-matrix.log` — 矩阵拍摄断言（会话就绪 / work 详情路由 / 表单面全 PASS）。

## B7 收尾

- 本 `INDEX.md`；全量回归、B1/B2 负向复跑、W8 资产断言、B4 gate 复跑结果见提交信息与 `w9-b4-gate.log`（19/19）。

## R1 终验修复批（F1~F8）

- `w9-r1-live-probe.log` / `.w9-r1-shoot.mjs` — 14 项活体断言全 PASS（3080 真实网关 + 真实模型流）：F1 徽章圆角 102/102=14px、F3 酱印双轨 gloss/shade（亮 #ffffff/#ffffff、暗 #2e241b/#241a12，hero+登录页）、F4 气泡/淡印钩子承形、F2 手打「【登录身份】foo」气泡可见 + B2 会话带尾巴注入行仍折叠（N5 回归）。
- `w9-r1-01-files-typebadge-radius-restored-375.png` — files 页徽章圆角复原（修复前 102 个 0px）。
- `w9-r1-02a/02b-home-seal-{light,dark}-375.png`、`w9-r1-02c-login-seal-dark-375.png` — 酱印渐变 token 化后亮暗双轨。
- `w9-r1-03-emptystate-stamp-faint-375.png` — 空态淡印挂 `.dshm-stamp-faint`。
- `w9-r1-04-handtyped-identity-line-bubble-visible-375.png` — 用户手打【登录身份】行（无系统注入尾巴）气泡可见。
- `w9-r1-05-legacy-tailed-stamp-still-folds-375.png` — B2 探针会话（seq7 带尾巴 stamp）注入行仍折叠。
- `w9-r1-03-hex-to-var-diff-summary.txt` — F3 hex→var 四处 + 双轨 token 定义摘要。
- `w9-r1-06-oxlint.log` — FilesView/read.ts 单文件 0 error + ui-mobile staged 门禁口径 0 error。
- `w9-r1-07-spec-runs.log` — ui-mobile 全量 691、tool-nocobase 55（含 F6 新增 nb_get owner 2 例）、apiproxy sessions-auth 12。
- `w9-r1-b4-gate-rerun.json` — B4 gate 19 项在 token 增删后复跑（19/19 ALL PASS；原 `w9-b4-light-probe.json` 未动）。
