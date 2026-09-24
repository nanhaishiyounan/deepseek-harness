# 05 · 自测证据（B1 阶段5 收口）

> 执行日期：2026-09-23 凌晨（本地 01:29–02:12）| 环境：3080 dev server（`DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml --no-open`，真实 MiniMax-M3 凭据在线）| 截图驱动：[`.shoot.mjs`](.shoot.mjs) + [`.shoot2.mjs`](.shoot2.mjs)（chrome-devtools 风格 CDP 自控 headless Chrome，390×844 视口；v4 `shoot.mjs` 惯例的 v5 版，`.mjs` 前缀隐藏）

## 1. 环境与前置修复

- 走查前发现 `/plugins/@deepseek-ai/dsh-client-ui-mobile/client.js` 404 假警报：ui-mobile 是**静态链接包**（无 `dsh.client` 声明，vite 打进 `apps/web/dist/assets/mobile-*.js`），不走 loader 路由；真实产物校验通过（dist 含 `report-card`/`创建处理任务`）。
- 按 `pnpm clean` 后教训重跑 `pnpm run build:lib:client`（tsc client face + tsdown 全量，Exit 0），随后重启 dev server 一次（长跑进程模块图新鲜度确认）。
- seed 会话注入器（`.shoot.mjs` 前半）：读 `apps/web/tests/snapshots/mobile-assistant/seed.jsonl` 裁剪到 turn4（report 围栏止），落 `examples/kb-agent/.dsh/sessions/<cwd桶>/session-<uuid>/session.jsonl.zstd`。三个坑位及解法（复跑者必读）：
  1. zstd 帧协议 = **每行一帧、首帧恰为 header**；`zstd -c <文件参数>` 压缩精确字节（stdin 模式会多补 `\n`，首帧校验必挂）。
  2. header 必须补 `delegationDepth: 0`（`parseHeaderMeta` 的 `isHeaderLine` 硬性要求；缺字段时目录扫描**静默跳过**，不报错）。
  3. 事件行须保留全部顶层字段（`surfaceOp` 等），仅注入 `seq`/`time`——自造 `{type,data}` 信封会被 `session.history` 校验拒收（`invalid seed event`）。
  4. server 会话索引在启动时构建：注入后必须**重启 dev server**，再 `SEED_ID=<id> node .shoot.mjs` 驱动走查。
- 本次注入的 seed：`session-a9e4ece1-f460-47a1-bc86-042b6394010d`（id 记录在 [`.seed-id`](.seed-id)，27 事件经 `session.history` 回读验证）。

## 2. 门禁终跑（B1 收口口径，三条全绿）

| 命令 | 结果 | 摘要 |
|---|---|---|
| `pnpm vitest run packages/client/ui-mobile` | ✅ | **543/543 通过**（32 个 spec 文件，29s）。首跑出现 1 例 flaky（views spec「驳回」臂），连续两次复跑均全绿——与批次1记录的 jsdom 时序 flaky 同源，详 §7 |
| `pnpm run typecheck && pnpm run lint` | ✅ | typecheck Exit 0；oxlint **0 warnings 0 errors**（3210 文件 / 89 规则 / 72.3s） |
| `pnpm run test:web -- mobile` | ✅ | **3 个 e2e 文件 13 用例全过**（29.6s）：mobile-assistant 4（含 aria golden + 协议不可见负断言族 + welcome 零冒名）、mobile-preview-iframe 3、mobile-shell 6（四 Tab / 白名单 chrome / v1v2 三代折叠） |

## 3. v8 ignore 预算（本批净增 6 条，均在理由正当域）

| 位置 | 行 | 理由 |
|---|---|---|
| `src/client/actions.ts` | :87 | `route.slice(2).split('/')[0]` 在非空串上恒有首元素（纯字符串代数） |
| `src/client/actions.ts` | :120/:166/:174 | rpc seam 以 Error 拒绝的不变式（`dispatchReportAction.send` / `startWorkExecution` 两臂）——与 ChatView/NewChatSheet 既有 seam ignore 同族 |
| `src/client/agents/AgentsView.tsx` | :24 | disabled 卡片屏蔽 busy 重入臂（按钮禁用态先行） |
| `src/client/work/TaskFormModal.tsx` | :101 | disabled 提交钮屏蔽 in-flight 重入臂 |

## 4. 截图索引（18 个 PNG，全部真实 CDP 渲染产物）

| 文件 | 路由/状态 | 验证点 |
|---|---|---|
| `verify-01-login.png` | `#/login` | 演示登录卡（食链通品牌 + 60s 倒计时 + demo 通道披露） |
| `verify-02-home-light.png` | `#/` 浅色 | 问候行 + 今日台账 2×2 统计 + 快捷任务 chips + AI 同事横滑 + 最近对话 |
| `verify-03-chats.png` | `#/chats` | 会话列表（v4 资产继承 + roster 显示名 subtitle） |
| `verify-04-chat-report.png` | `#/chat/:seedId` | v3 表单流（ask/draft/receipt）与 report 卡同流混排；ReportCard 指标 3 格 + 风险 3 条 + 双 action |
| `verify-05-taskform-modal.png` | report 卡 → TaskFormModal | AI 建议预填（标题「跟进鲜丰冷链箱交期」+ 只读 AI 建议块 + 负责人/截止/立即执行） |
| `verify-06-work-four-states.png` | `#/work` | CapsuleTabs 四态（DOM 断言四 tab 各含对应卡：待处理=走查任务 / 进行中·待确认·已完成=demo seed） |
| `verify-07-work-detail-todo.png` | `#/work/:id`（todo） | 工作票头 + 上下文卡 + 空时间线 + 开始执行 |
| `verify-07-work-detail-review.png` | `#/work/:id`（review） | 装订线时间线 4 步全绿 + 结果卡 + 确认完成/打回修改 |
| `verify-07b-work-detail-done.png` | `#/work/:id`（done） | 已完成章 + 回到聊天 |
| `verify-08-tasks.png` | `#/tasks`（团队 tab） | 我的/团队分组 + 演示团队横幅 + 示例 Tag + owner 尾注 |
| `verify-09-files.png` | `#/files` | AI 生成 / 最近文件 / 收藏三分区（demo 收藏 + 星标） |
| `verify-10-agents.png` | `#/agents` | AI 同事角色卡（roster 四角色 + 找 XX aria + 发消息） |
| `verify-11-me.png` | `#/me` | 工作空间统计 + AI 偏好（真实模式关=演示）+ 通知 + 清除演示数据 |
| `verify-12-home-dark.png` | `#/` 暗色 | data-theme=dark 双轨首页 |
| `verify-13-chat-report-dark.png` | `#/chat/:seedId` 暗色 | report 卡暗轨（墨青暗色 token） |
| `verify-14-pc-mobile-preview.png` | PC `移动端预览` tab | 390×844 手机壳 iframe 渲染 v5 首页（同源数据：已完成 2 = demo 1 + 走查 1） |
| `verify-15-timeline-running.png` | `#/work/:id`（doing 中间帧） | 演示时间线推进中间态（running 呼吸点 + 已完成步骤） |
| `verify-16-back-to-chat.png` | `#/chat/:seedId`（闭环末） | M1/M3 以普通用户消息渲染在源会话（真实 durable log 回放） |

视口：移动页 Emulation 390×844 DSF2；PC 页 1280×832。走查日志：`.walkthrough-part2.log` + 本报告 §5（part1 日志因脚本中途迭代未落盘，记录已并入本表）。

## 5. 演示态闭环走查记录（无 key 剧本全通）

runMode 钉死：登录后 `localStorage['dsh-mobile-runmode']='demo'`（ProfileView「真实模式」开关的同款显式通道，`runMode.ts:41`）。server 侧真实 LLM 在线，走查验证的是**前端两态切换正确性**与「模型可见⟺日志可重建」红线。

| # | 步骤 | 验证点 | 结果 |
|---|---|---|---|
| 1 | `#/` 首页 | 问候/台账/快捷/同事/最近对话五块齐 | ✅ verify-02 |
| 2 | seed 会话进聊天 | report 卡渲染（`[data-testid=report-card]`）+ v3 流同屏 | ✅ verify-04 |
| 3 | report 卡「创建处理任务」 | TaskFormModal 弹出，AI 预填标题+建议 | ✅ verify-05 |
| 4 | 提交 | Toast「已创建任务」+ 跳 `#/work/w_mucz4usph74l`；**M1 经真实 gateway 进源会话 durable log** | ✅ |
| 5 | 工作页四态 | 四 capsule 各含其卡（DOM 逐 tab 断言） | ✅ verify-06 |
| 6 | 详情开始执行 | demo 时间线 4 步×1s 推进（中间帧 verify-15）→ finished 翻 review + **M3 进 log** | ✅ verify-07 |
| 7 | 确认完成 | review→done，操作区换「回到聊天」 | ✅ verify-07b |
| 8 | 回到聊天 | M1/M3 以普通用户消息可见（`#/chat/:seedId`） | ✅ verify-16 |
| 9 | 刷新持久化 | `Page.reload` 后四态与走查任务俱在（workStore localStorage 恢复） | ✅ |
| 10 | 模拟不进 log | `session.history` 回读 59 事件：M1/M3 在；**demo 四步标签（读取工作上下文/汇总关键信息/起草处理结果/核对并定稿）零出现** | ✅ |

走查副产物（真实 log 内容佐证）：M1 触发后 server 侧真实 agent loop 运行——log 含 runtime-context 快照注入与「【当前工作台视图】当前为对话视图(chat)」，与 AI 真实收尾链路一致。注意：走查脚本一次中途迭代失败重跑会在源会话留**第二条 M1**（本次 log 中可见两条 M1，分属两次提交），产品行为正确（每次创建任务都发通知），截图 verify-16 如实呈现。

## 6. 硬约束六条自查（PLAN §3.4）

| # | 约束 | 判定 | 证据 |
|---|---|---|---|
| 1 | 真实 LLM 链路在新 IA 下未动 | ✅ | `git diff HEAD -- sessionsService.ts` 仅 roster 显示名缓存/subtitle 展示层（+14/−5）；`promptSession`/`readHistory`/`createSession` 核心链路零改动；走查中 M1/M3 触发真实 agent loop 回复 |
| 2 | v3 表单流程完整 | ✅ | verify-04：ask_choice（已答灰化）/form_draft/submit_receipt 与 report 卡同流渲染；e2e mobile-assistant 的 fork/draft/confirm 三用例绿 |
| 3 | wire 无写方法 | ✅ | `git diff HEAD -- rpc.ts` 唯一改动 = `MobileRpcMethod` 联合**加读方法 `'llm.models'`**（两态探测）；无任何写方法；`nb_create` 仍只存在于 agent 工具面 |
| 4 | PC 预览零回归 | ✅ | verify-14（iframe 渲染 v5 首页同源数据）+ e2e mobile-preview-iframe 3 用例绿（golden 重录后） |
| 5 | 两态数据源切换 | ✅ | `runMode.ts:31`（`llm.models` 探测，失败落 demo）+ `workTimeline.ts:58`（liveTimeline 轮询 exec 会话）/`:135`（demoTimeline 纯定时器）——`TimelineDataSource` 同一接口，WorkDetailView 按 mode+execSessionId 选择 |
| 6 | 模拟不进 durable log | ✅ | `workTimeline.ts:120-195` demoTimeline 纯内存（无 sessionsService import）；走查后 `session.history` 59 事件中 demo 四步零出现（§5 #10） |

## 7. 已知限制与遗留清单

1. **FilesView「最近文件」恒空的设计矛盾**（P2）：`FilesView.tsx` 头注自认——AI生成分区列全量近 7 天 artifacts，「最近文件」是其去重子集，子集永远空文案。属 02 §2.7 设计自洽性问题，交 B2 裁决（合并分区或改数据源）。
2. **mobile-assistant.e2e.ts console.log 调试残留**（P2）：[:250](../../apps/web/tests/mobile-assistant.e2e.ts:250) `BLANK-BODY`/`LIST` 两处排障输出未清。
3. **antd-mobile NavBar `backArrow` deprecated**：v5 全部新视图已用 `backIcon`（tsx 属性），无 deprecation 告警面。
4. **jsdom 时序 flaky**（P2）：views spec「驳回」臂首跑偶发失败（本批首跑 1 例，两次复跑全绿）；与批次1记录同源，jsdom 下 antd-mobile Modal/Toast 异步清除时序，未修。
5. **走查脚本重跑污染**（工具注意）：M1 为真实 user 消息，失败重跑会在源会话留重复通知（§5）；B2 走查请用 fresh seed。
6. ~~**package.json description 漂移**（P2 文档）~~ **已修复**：B1 收尾时改为 v5 实况（ten-route workmate + 四 Tab + 工作闭环一句话），JSON 校验通过。
7. **composer chips 与输入框间距偏紧**（P3 视觉观察，v4 遗留）：verify-04 底部「再来一单/查这条记录」chips 与 composer 几乎无留白；非溢出，交 B2 视觉走查定夺。
8. **本地态跨设备不同步**：workStore/收藏/通知为 localStorage（README 已知限制延续）。
9. **演示态发送消息无 AI 回复**：demo 态 promptSession 照发（真实 log），但无 key 环境 AI 不答——聊天页在 demo 态的「有问必答」体验依赖 seed 回放，属两态边界如实记录（R8 口径，非缺陷）。

## 8. 交 B2 验收的重点建议

1. **真实态闭环补证**（B2 核心增量）：本批走查钉 demo 验证前端两态切换；B2 应在「真实模式」开（`dsh-mobile-runmode='live'`）下重走 report→创建任务→**真实隐藏 exec 会话**→liveTimeline 轮询→M3，并核对 exec 会话不污染会话列表（R6）。
2. seed 注入四坑（§1）可直接复用 `.shoot.mjs` 的注入段；建议 B2 前先清掉本批 seed 会话目录避免会话列表干扰。
3. coverage 全量（`pnpm run test:coverage`）为 B2 口径，本批未跑（按 PLAN 批次门禁分工）。
4. 视觉对比度/暗轨全页走查建议以 verify-12/13 为基线扩展到 tasks/files/agents/me 四页暗轨（本批按清单只截首页与聊天暗轨两张）。

## 9. B3 修复与复验（findings 清尾批次）

> 执行日期：2026-09-23 凌晨｜B2 验收 FAIL(70) 的 P0/P1/Minor 全量清尾；每处修复配回归测试（RED→GREEN），fixture 取自真实捕获形态。

### 9.1 逐项修复状态

| Finding | 修复 | 状态 |
|---|---|---|
| **C1** report 卡 100% 降级 | 双根因双修：① create-task 动作 `title` 缺失但 `text` 存在 → 前 32 码点折为 title、text 全文作 suggestion（显式 suggestion 优先；两者皆无仍拒）② 真实 LLM 会写 `"table": null` 显式空 → null 视同缺省不再整卡降级（B3 走查新捕获的第三种真实形态）。preset prompt 双侧对齐：business-advisor 围栏示例补 create-task 原型 +「必须含 title」；两 preset 均禁 `"table": null` 写法 | ✅ CLOSED |
| **I1** XSS 向量 | link 动作 URL 解析后加 scheme 白名单（仅 http/https），javascript:/data:/vbscript:/file: 拒绝 + Toast | ✅ CLOSED |
| **I2** typing 永久卡死 | send 失败 catch 清 typing 定时器与呼吸点，失败即恢复可输入 | ✅ CLOSED |
| **I3** 时间线 state 漏检 | liveTimeline 变更检测改为逐步骤 label:state 签名 + finish/summary 联合比较，同数 running→done 翻转也广播 | ✅ CLOSED |
| **I4** workStore 写失败/多 Tab | commit 的 setItem 加 catch：失败降级内存态 + 广播 + Toast；注册 storage 监听合并远端（新项并入、同 id 取 updatedAt 新者、exec 集合并集、seeded 闩锁）；TaskFormModal 的 unhandled rejection 随 commit 不再抛出而消除 | ✅ CLOSED |
| **I5** doing 无逃生门 | 工作详情 doing 态补「重新执行」（重发 M2 至既有 exec 会话；无会话则新建+登记）与「手动完成」（记录时间线尾摘要/兜底文案 → review + M3 走 durable log，与自动完成同构） | ✅ CLOSED |
| **I6** 过滤选中态丢失 | WorkView capsule 选中改模块级记忆态，路由往返（shell 重挂载）不回退 todo | ✅ CLOSED |
| Minor×8 | 「开始处理」→「开始执行」（含表单开关提示语）；清除演示数据加确认 Dialog + seeded 复位可重 seed；版本常量收敛 APP_VERSION='v5'；e2e console.log 残留删除；entry/App 头注 four-tab；首页 chips/同事卡失败补 Toast（对齐 AgentsView）；#/chat 无参折叠到 #/chats；深色态「我」头像底改 var(--dshm-primary) + 暗轨 muted-foreground 提亮 #b0c1bb（03 §7.2 B3 补记） | ✅ CLOSED |
| FilesView 恒空 | 裁决落地互补方案：最近文件 = 近 7 天全部（行带 AI 来源徽标），AI 生成 = 其 AI 来源过滤子集，收藏不变；02 §2.7 与 README 双语同步 | ✅ CLOSED |

### 9.2 门禁数字（B3 终态）

| 命令 | 结果 |
|---|---|
| `pnpm vitest run packages/client/ui-mobile` | ✅ **568/568**（32 spec；原 543 + 新增 25） |
| 改动文件 per-file coverage | ✅ protocol/actions/workStore/ChatView/ProfileView/workTimeline/WorkView/HomeView/FilesView/router/App/entry/demoSeed/WorkDetailView/TaskFormModal 全部 **100/100/100/100** |
| `pnpm run typecheck` / `pnpm run lint` | ✅ Exit 0 / **0 warnings 0 errors**（3210 文件） |
| `pnpm run test:web -- mobile` | ✅ **3 文件 13 用例全过**（golden 无重录，负断言原样保留） |
| `pnpm run doc-sync` | ✅ **29/29**（README 双语改写后 verify-translation-pairing --write 重录 1 对，1141 对全一致） |
| v8 ignore | 本批净增 **1 条**（ProfileView:107 disabled 按钮屏蔽 busy 重入臂，与 AgentsView/TaskFormModal 同族），累计 7/10 |

### 9.3 真实 LLM C1 主通路复验（chrome-devtools，真实 API）

dev server `:3080`（clean 后 `pnpm run build` 全量重建 dist，新 hash `mobile-DIMYBIOh.js`；**教训：dsh web 供给的是 dist hash 产物，改 packages 源码必须全量 build 再重启，仅 build:lib:client 不够**）。登录态 + `dsh-mobile-runmode='live'`，新会话（business-advisor）发「分析当前项目风险」：

| # | 截图 | 验证点 |
|---|---|---|
| b3-01 | `b3-01-advisor-newsession.png` | 经营参谋新会话欢迎屏（真实模式） |
| b3-02 | `b3-02-report-card-live.png` | **真实 LLM report 卡完整渲染**（6 指标 + 8 风险行 + 3 动作，零降级；本会话 fence 含 "table": null 真实形态，修复后合法） |
| b3-03 | `b3-03-taskform-modal.png` | 「创建油脂锁价任务」→ Modal AI 预填（标题+建议+「开始执行」新文案） |
| b3-04 | `b3-04-work-doing-live-timeline.png` | 提交（立即执行）→ 真实隔离 exec 会话 + M2 → liveTimeline 真实工具行推进 |
| b3-05 | `b3-05-work-review-result.png` | 真实执行完成 → 自动 review + 真实结果摘要 + M3 落源会话 |
| b3-06 | `b3-06-work-done-backtochat.png` | 确认完成 → done + 回到聊天 |
| b3-07 | `b3-07-back-to-chat-m1m3.png` | 源会话见 M1（已创建处理任务：…）与 M3（工作已完成：…请确认）真实 user 消息 + AI 回应 |
| b3-08 | `b3-08-work-four-states.png` | 工作页四态（走查任务 done + demo seed 三态） |

真实捕获证据：本会话降级 fence 全文存 [`.captured-fence.txt`](.captured-fence.txt)（回归 fixture 来源）；截图驱动 [`.b3shot.mjs`](.b3shot.mjs)。

### 9.4 B3 已知限制（含 I5 逃生门边界）

1. **I5 逃生门边界**：「重新执行」向既有 exec 会话重发 M2——若原会话本身挂起（模型空转），重发可能同样空转，此时用「手动完成」自救；手动完成的摘要取当前时间线尾（无产出时为兜底文案「人工确认完成」）。演示态下「重新执行」会真实建会话发指令（demo 时间线本身不受影响）。
2. C1 折叠兼容面：前端已兼容 text-代-title、`"table":null` 两种真实形态；真实 LLM 仍可能产生新的非法形态（如 metrics 超限）——按契约整卡降级不回退，preset prompt 已双侧教学规避。
3. 多 Tab 合并为 localStorage 层（同浏览器多 Tab）；跨设备仍不同步（README 已知限制延续）。
