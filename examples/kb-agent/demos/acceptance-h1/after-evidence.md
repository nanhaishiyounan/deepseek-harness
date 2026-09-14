# H1 after 验收证据（2026-09-15，:3080 真机，重建 lib/web dist 后）

## 断言 1：八 view tab 条顺序与文案（中文环境）

`["对话","知识库","场景","数据资产","连接器","图谱","业务管理","轨迹"]` —— 场景插在知识库(10)与数据资产(11)之间（order 10.5，浮点排序）。

## 断言 2：场景 tab 独立完整（非 blank 会话，4 轮历史会话「数据空间的标准里，有没有规」实测）

- `h2: ["场景中心"]`，tagline「三十个食品产业 AI 场景 · 一键配置专属智能体」
- meta chips：`文档 21 / 检索 6 次 / 30 个场景`
- 示例问题两枚 ghost 按钮（酱油中山梨酸钾…/GB 14881…）——askInChat 模式（setDraft + requestView('chat')，e2e 断言 tab 切回 chat 且 textarea 预填）
- 精选 6 场景卡（scenarioCards=6，AI 营销洞察主管可见）+ 8 分类折叠行（市场洞察5/工艺4/食品安全4/成本3/供应链6/出海5/设备1/数据资产2）
- searchbox「搜索场景」+ 最近检索 rail
- **console error/warn = 0**

## 断言 3：其他 tab 无场景门户（对照 before-evidence.md）

图谱 tab 选中时整棵 a11y 树无 region「场景」/精选卡/用量 chips/示例问题/最近检索（before 快照中这些都挂在 composer 上方）。e2e 另断言 workbench tab、blank chat tab 同样为 0。

## 断言 4：blank chat 保留 headline

blank 会话 chat tab：headline（食品产业知识库问答 + tagline）保留；场景门户整段为 0（`scenarioCard count = 0`，`30 个场景 · 分类浏览` count = 0）。

## 断言 5：测试

- `npx vitest run packages/client/ui-kb/tests/` → 13 files / 145 tests 全绿（含新 scenarioview.client.spec.tsx 15 cases：任意会话状态渲染/四态 meta/精选/分类/搜索/Modal/英文/recent）
- `DSH_SNAPSHOT=replay vitest --config vitest.web.config.ts apps/web/tests/kb-workbench.e2e.ts` → 14/14 全绿（hero 断言段改写为场景 tab 断言：`keeps the blank chat hero to its headline and gates the scenario portal behind its own tab` 等）
- `pnpm exec tsc -b tsconfig.client.json` EXIT=0；`pnpm run build` EXIT=0（210 client artifacts）
- cold-blank-session.e2e 1/1 绿（sidebar 快照无涉）
- hmr-live.e2e 基线即失败（git stash 后同样崩：Node 22.19 + import-without-cache load hook 的环境问题，与本批无关）

## 实施裁量（对 10-h1 计划的一处偏离）

计划裁决「blank chat 保留 headline+tagline+示例问题两枚 ghost 按钮」。实施时示例问题按钮迁入场景 tab 顶部（samples 行）而非留守 blank chat：headline 座位是 root-scope（拿不到 `inputActions.setDraft`），而 dock 座位残留会在其他业务 tab 上继续泄露 KB 元素——违背更硬的验收断言 3（他 tab 零渲染）。示例问题的起手价值由场景 tab+知识库工作台 sample chips 完整承接。
