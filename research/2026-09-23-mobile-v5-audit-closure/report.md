# Mobile v5 audit-closure 独立验证报告（verify-executor）

日期：2026-09-23 · 服务器：http://localhost:3080（真实 dev server，dist 构建于 11:01 > 源码 09:23）· 视口：390×844@3 · 证据目录：research/2026-09-23-mobile-v5-audit-closure/

## 判定总表

| # | 验证点 | 判定 | 证据 |
|---|--------|------|------|
| A1 | chat 左上角单一返回 | **PASS** | DOM：`.adm-nav-bar button[aria-label="返回"]`=1、img=0、svg=2（箭头+加号）；视觉确认 vfy-ac-01-chat-top.png 仅一个左箭头 |
| A2 | 返回功能真实回退 | **PASS** | 点击后 hash `#/chat/session-56e7…` → `#/chats`；vfy-ac-02-chat-back-works.png 为消息列表页 |
| A3 | work-detail 单返回 | **PASS** | cardHeadButton 进入 `#/work/w_mudl8t4g4eqr`，labeled-back=1；vfy-ac-03 |
| A4 | tasks 单返回 | **PASS** | labeled=1（注：高度 45px，见缺陷 D1）；vfy-ac-04 |
| A5 | files 单返回 | **PASS** | labeled=1；vfy-ac-05 |
| A6 | agents 单返回 | **PASS** | labeled=1；vfy-ac-06 |
| A7 | 顶部安全区 | **PASS** | CSS `padding-top: env(safe-area-inset-top)`（tokens.css:89）+ dist CSS 命中；注入 47px 模拟 nav 下移至 y=47 无遮挡；桌面 paddingTop=0px 无异常空白；vfy-ac-07 |
| A8 | HomeView 骨架 | **PASS** | CDP Fetch 延迟 /api/* 下 21 个骨架/status 节点（SkelCard 卡片+SkelRow 行），放行后 0；vfy-ac-08 / 08b |
| A9 | 暗色 chat | **PASS** | 单返回、无白底穿帮；1px rim 分隔线在暗色下偏亮为设计取舍（观察项 O1）；vfy-ac-09 |
| A10 | NewChatSheet 无嵌套 | **PASS** | chips=4 全为 SPAN，sheet 内 button 祖先嵌套 button=0；vfy-ac-10 |
| A11 | Files 星标兄弟化 | **PASS** | fileTop DIV=3、fileTopMain button=3 同层兄弟、bad=[]、全页嵌套 button=0；vfy-ac-11 |
| A12 | 触达区 ≥44px | **PASS** | 返回 backHit 44×44；发送按钮 44×44 |
| B1 | 死代码清零 | **PASS** | grep `backButton`/`noticeError`/`startButton`/`--dshm-font-mono`/`max-width:200px` 全包 0 命中；dist js 中 backButton=0 |
| B2 | 无 button 嵌套 JSX | **PASS** | 源码嵌套模式 0 命中 + DOM A10/A11 双确认 |
| B3 | PageNav 收口 | **PASS** | `<NavBar` 仅 PageNav.tsx:34 一处；五页面（ChatView362/WorkDetailView163,175/TasksView54/FilesView113/AgentsView41）全部 `<PageNav`；`left={` 0 命中；JSDoc+PageNavProps 契约完整 |
| B4 | Agent Note 三元组 | **PASS** | md（6.6KB）/zh.md/i18n.yaml 齐备，Status: implemented，双语互链，内容与实现一致 |
| C1 | 包单测 | **PASS** | 见文末补录（独立复跑） |
| C2 | build 产物新鲜 | **PASS（按约定跳过重 build）** | lib/page-nav.module.css 11:01 > src 09:23；dist/assets 同批；3080 服务该产物且全部视觉验证通过；bundle 内唯一 `aria-label:"返回"` 即 PageNav backHit |
| C3 | mobile e2e | **PASS** | `pnpm run test:web -- mobile-assistant` 5/5 通过（含 golden 稳定性测试） |
| C4 | lint | **PASS** | `tsx scripts/run-oxlint.ts packages/client/ui-mobile`：0 warnings 0 errors（87 files, 89 rules） |
| golden | chat.expected.md 单按钮结构 | **PASS** | 已刷新为嵌套单结构（外层 antd 匿名容器从内容继承名"返回" > 内层真实 button"返回"）——非双箭头；与 PageNav 设计及 Agent Note 记录一致 |

## 头号项专述：双返回修复三重证据链

1. **视觉**：vfy-ac-01-chat-top.png（390×844 真机视口、真实服务器）左上角仅一个 `＜` 箭头；导航栏元素 = 箭头 + 头像 + 标题/副题 + 右侧 +。
2. **DOM**：`.adm-nav-bar` 内 `button[aria-label="返回"]` 恰好 1 个，`img`（旧死箭头）0 个；ChatView 源码无手绘 `left` slot（grep `left={` 0 命中）；返回唯一权威 = PageNav 的 `backIcon/onBack`（PageNav.tsx:34-43）。
3. **功能**：CDP 真实点击该按钮 → hash 由 `#/chat/session-56e73331-e1d6-42a4-a8ac-669df6f64de4` 回退至 `#/chats`，消息列表渲染完整（搜索框/分类 tab/会话行/tabbar）。
4. **产物链**：dist bundle（mobile-BAydeCtK.js）内 `aria-label:"返回"` 全局唯一 = PageNav backHit button；golden e2e（"keeps the mobile chat golden stable"）通过。

## 缺陷清单

| # | 严重度 | 缺陷 | 复现/证据 | 建议修复 |
|---|--------|------|-----------|----------|
| D1 | **Important**（非 P0） | PageNav 的 52px 高度 token 未生效：page-nav.module.css:6 设置 `--adm-nav-bar-height: 52px`，但 antd-mobile NavBar 实际读取的是 `--height`（dist CSS：`.adm-nav-bar{--height:45px;…height:var(--height)}`），所有二级页 NavBar 实测 45px | dist/assets/mobile-D2VXZhv9.css 中两条规则并存；运行时 getComputedStyle = 45px（A3-A6/A9 探针） | page-nav.module.css 改设 `--height: 52px`（antd-mobile v5 NavBar 的 CSS 变量名） |
| O1 | Observation | 暗色下 PageNav 的 1px `--dshm-border` 底边线比正文略亮（"rim underline"设计在暗色下的观感），AI 视觉模型判为轻微违和 | vfy-ac-09-dark-chat.png | 可选：暗色下加深 border 色阶 |
| O2 | Observation | safe-area 验证方式说明：headless Chrome 无法注入真实 env(safe-area-inset-top)，采用注入等值 47px padding 模拟 + 静态 CSS 规则存在性双路验证 | vfy-ac-07-safe-area.png | 无需动作（记录方法） |

## 门禁独立复跑（C1 补录）

- 命令：`pnpm run test -- packages/client/ui-mobile`（root vitest 实际全仓执行，日志 /tmp/vfy-c1-unittest.log）
- 全仓结果：17090 passed / 12 failed / 114 skipped；8 failed 文件中 11/12 失败位于无关包（hooks-claude-code、hooks-codex×4、bash-sandbox×2、oxlint-contract、py-types×2、code-runtime-worker-thread）——任务书 D 节已知噪音。
- ui-mobile：31 个测试文件，30 个全绿（562 tests），唯一失败 `views.client.spec.tsx > mobile me tab (v5 additions) > shows the workspace card, flips the run mode to live, and clears the demo data`——AssertionError: Toast 停在「已切换为真实模式」未含「演示数据已清除」。
- **flaky 甄别**：单独重跑该用例 ×2 PASS（485ms/470ms）；整文件重跑 `vitest run views.client.spec.tsx` 87/87 PASS。判定为全仓 32 线程并发高压下 Toast/Dialog 异步链的时序型 flaky，非本次改动回归（该区 ProfileView 属前序未提交改动，且两条 Toast 路径 ProfileView.tsx:231/254 均在）。
- **C1 判定：PASS（附时序 flaky 备注）**

## 最终判定

**PASS**（条件：缺陷 D1 建议后续 PR 修复——非 P0，不阻断）

- 头号 P0（双返回）三重证据链全部闭合。
- A1-A12 / B1-B4 / C1-C4 / golden 全部 PASS。
- D1（PageNav 52px token 写错变量名，实际 45px）为 Important 级视觉意图未达成，功能与统一性不受影响。
- C1 存在 1 个已甄别的时序 flaky，复跑均绿。
